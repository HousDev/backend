const Property = require("../models/Property");
const MasterData = require("../models/masterModel");
const path = require("path");
const fs = require("fs");

const db=require("../config/database")
const { publicFileUrl, fileRelPathFromUpload } = require("../utils/url");
// ---------------------
// Helper Functions
// ---------------------
const parseArrayField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === "string") {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return field
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const parseNearbyPlaces = (req) => {
  if (Array.isArray(req.body.nearby_places)) return req.body.nearby_places;
  if (
    typeof req.body.nearby_places === "string" &&
    req.body.nearby_places.trim() !== ""
  ) {
    try {
      const parsed = JSON.parse(req.body.nearby_places);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      console.warn("Failed to parse nearby_places as JSON");
    }
  }
  return [];
};

const buildPropertyData = (req, ownershipDocPath, photoPaths) => ({
  seller_name: req.body.seller || null,
  property_type_name: req.body.propertyType || null,
  property_subtype_name: req.body.propertySubtype || null,
  unit_type: req.body.unitType || null,
  wing: req.body.wing || null,
  unit_no: req.body.unitNo || null,
  furnishing: req.body.furnishing || null,
  parking_type: req.body.parkingType || null,
  parking_qty: req.body.parkingQty || null,
  city_name: req.body.city || null,
  location_name: req.body.location || null,
  society_name: req.body.society || null,
  floor: req.body.floor || null,
  total_floors: req.body.totalFloors || null,
  carpet_area: req.body.carpetArea || null,
  builtup_area: req.body.builtupArea || null,
  budget: req.body.budget || null,
  address: req.body.address || null,
  status: req.body.status || null,
  lead_source: req.body.leadSource || null,
  possession_month: req.body.possessionMonth || null,
  possession_year: req.body.possessionYear || null,
  purchase_month: req.body.purchaseMonth || null,
  purchase_year: req.body.purchaseYear || null,
  selling_rights: req.body.sellingRights || null,
  ownership_doc_path: ownershipDocPath,
  photos: photoPaths,
  amenities: parseArrayField(req.body.amenities),
  furnishing_items: parseArrayField(
    req.body.furnishingItems || req.body.furnishing_items
  ),
  nearby_places: parseNearbyPlaces(req),
  description: req.body.description || null,
});

// ---------------------
// Small utils
// ---------------------
const safeJson = (s) => {
  if (!s || typeof s !== "string") return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

// ✅ Always store PUBLIC path like createProperty
const toPublic = (f) =>
  "/uploads/properties/" +
  (f.filename || path.basename(f.path)).replace(/\\/g, "/");

// ---------------------
// Controller Functions
// ---------------------

// CREATE
const createProperty = async (req, res) => {
  console.log("=== DEBUG: File Upload ===");
  console.log("CT:", req.headers["content-type"]);
  console.log(
    "Has files?:",
    !!req.files,
    "keys:",
    req.files ? Object.keys(req.files) : []
  );
  console.log("Body keys:", Object.keys(req.body || {}));
  console.log("Files received:", req.files);
  console.log("Body received:", req.body);

  // Check if upload directory exists
  const uploadDir = path.join(process.cwd(), "uploads", "properties");
  console.log("Upload directory exists:", fs.existsSync(uploadDir));
  console.log("Upload directory path:", uploadDir);

  if (req.files) {
    Object.keys(req.files).forEach((key) => {
      req.files[key].forEach((file) => {
        console.log(`File ${key}: ${file.filename} at ${file.path}`);
        console.log(`File exists: ${fs.existsSync(file.path)}`);
      });
    });
  }

  try {
    // Convert multer file objects to PUBLIC paths
    const ownershipDocPublic = req.files?.ownershipDoc?.[0]
      ? toPublic(req.files.ownershipDoc[0])
      : null;

    const photoPublicPaths = (req.files?.photos || []).map(toPublic);

    const propertyData = buildPropertyData(
      req,
      ownershipDocPublic,
      photoPublicPaths
    );
    const propertyId = await Property.create(propertyData);

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: {
        id: propertyId,
        uploadedFiles: {
          ownershipDoc: ownershipDocPublic ? 1 : 0,
          photos: photoPublicPaths.length,
        },
      },
    });
  } catch (error) {
    console.error("Create failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create property",
      error: error.message,
    });
  }
};

// READ (all)
const getAllProperties = async (req, res) => {
  try {
    const properties = await Property.getAll();
    res.json({ success: true, data: properties });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch properties",
      error: error.message,
    });
  }
};

// READ (single)
const getProperty = async (req, res) => {
  try {
    const property = await Property.getById(req.params.id);
    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });
    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch property",
      error: error.message,
    });
  }
};

// UPDATE — preserves existing photos/doc, merges new uploads, stores public paths
const updateProperty = async (req, res) => {
  try {
    const id = req.params.id;

    // 1) Current record for fallbacks
    const current = await Property.getById(id);
    if (!current) {
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });
    }

    // 2) Parse existing photos from body (JSON string array)
    const bodyExistingA = safeJson(req.body.existingPhotoUrls);
    const bodyExistingB = safeJson(req.body.existingPhotos);
    const existingFromBody = Array.isArray(bodyExistingA)
      ? bodyExistingA
      : Array.isArray(bodyExistingB)
      ? bodyExistingB
      : undefined; // not provided

    // 3) New uploads -> public paths
    const uploadedPhotoPublic = (req.files?.photos || []).map(toPublic);

    // 4) Merge strategy toggle (support both flags)
    const wantsMerge =
      String(req.body.mergePhotos).toLowerCase() === "true" ||
      String(req.body.appendPhotos).toLowerCase() === "true";

    // 5) Decide final photos
    const baseExisting = Array.isArray(existingFromBody)
      ? existingFromBody
      : Array.isArray(current.photos)
      ? current.photos
      : [];

    let finalPhotos;
    if (wantsMerge) {
      finalPhotos = [...baseExisting, ...uploadedPhotoPublic];
    } else if (
      Array.isArray(existingFromBody) ||
      uploadedPhotoPublic.length > 0
    ) {
      finalPhotos = [...baseExisting, ...uploadedPhotoPublic];
    } else {
      // nothing specified — preserve current
      finalPhotos = Array.isArray(current.photos) ? current.photos : [];
    }

    // 6) Ownership document
    const uploadedDocPublic = req.files?.ownershipDoc?.[0]
      ? toPublic(req.files.ownershipDoc[0])
      : null;

    const existingDocFromBody =
      req.body.existingOwnershipDocUrl || req.body.existingOwnershipDoc || null;

    const finalOwnershipDoc =
      uploadedDocPublic !== null
        ? uploadedDocPublic
        : existingDocFromBody !== null
        ? existingDocFromBody
        : current.ownership_doc_path || null;

    // 7) Build payload (normalize)
    const propertyData = {
      seller_name: req.body.seller || null,
      property_type_name: req.body.propertyType || null,
      property_subtype_name: req.body.propertySubtype || null,
      unit_type: req.body.unitType || null,
      wing: req.body.wing || null,
      unit_no: req.body.unitNo || null,
      furnishing: req.body.furnishing || null,
      parking_type: req.body.parkingType || null,
      parking_qty: req.body.parkingQty || null,
      city_name: req.body.city || null,
      location_name: req.body.location || null,
      society_name: req.body.society || null,
      floor: req.body.floor || null,
      total_floors: req.body.totalFloors || null,
      carpet_area: req.body.carpetArea || null,
      builtup_area: req.body.builtupArea || null,
      budget: req.body.budget || null,
      address: req.body.address || null,
      status: req.body.status || null,
      lead_source: req.body.leadSource || null,
      possession_month: req.body.possessionMonth || null,
      possession_year: req.body.possessionYear || null,
      purchase_month: req.body.purchaseMonth || null,
      purchase_year: req.body.purchaseYear || null,
      selling_rights: req.body.sellingRights || null,

      // 🔒 preserve/merge results
      ownership_doc_path: finalOwnershipDoc,
      photos: finalPhotos,

      amenities: parseArrayField(req.body.amenities),
      furnishing_items: parseArrayField(
        req.body.furnishingItems || req.body.furnishing_items
      ),
      nearby_places: parseNearbyPlaces(req),
      description: req.body.description || null,
    };

    await Property.update(id, propertyData);

    return res.json({
      success: true,
      message: "Property updated successfully",
      data: {
        id,
        updatedFiles: {
          ownershipDoc: uploadedDocPublic ? 1 : 0,
          photos: uploadedPhotoPublic.length,
        },
      },
    });
  } catch (error) {
    console.error("Update failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update property",
      error: error.message,
    });
  }
};

// DELETE
const deleteProperty = async (req, res) => {
  try {
    await Property.delete(req.params.id);
    res.json({ success: true, message: "Property deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete property",
      error: error.message,
    });
  }
};

// ADD MORE PHOTOS TO EXISTING PROPERTY (public URLs)
const addPhotosToProperty = async (req, res) => {
  try {
    const photoPublicPaths = (req.files?.photos || []).map(toPublic);

    if (photoPublicPaths.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No photos provided",
      });
    }

    await Property.addPhotos(req.params.id, photoPublicPaths);

    res.json({
      success: true,
      message: `${photoPublicPaths.length} photos added successfully`,
      data: {
        addedPhotos: photoPublicPaths.length,
      },
    });
  } catch (error) {
    console.error("Add photos failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add photos",
      error: error.message,
    });
  }
};

// DELETE PHOTOS FROM PROPERTY
const deletePhotosFromProperty = async (req, res) => {
  try {
    const { photoUrls } = req.body; // Array of photo URLs to delete

    if (!photoUrls || !Array.isArray(photoUrls)) {
      return res.status(400).json({
        success: false,
        message: "Please provide array of photo URLs to delete",
      });
    }

    await Property.deleteSpecificPhotos(req.params.id, photoUrls);

    res.json({
      success: true,
      message: `Photos deleted successfully`,
      data: {
        deletedCount: photoUrls.length,
      },
    });
  } catch (error) {
    console.error("Delete photos failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete photos",
      error: error.message,
    });
  }
};

// MASTER DATA
const getMasterData = async (req, res) => {
  try {
    const masterData = await MasterData.getAll();
    res.json({ success: true, data: masterData });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch master data",
      error: error.message,
    });
  }
};

// MIGRATE
const migratePropertyData = async (req, res) => {
  try {
    const result = await Property.migrateData();
    res.json({ success: true, message: "Migration complete", data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Migration failed",
      error: error.message,
    });
  }
};

// GET /properties/search
// GET /properties/search
const searchProperties = (req, res) => {
  try {
    let {
      city,
      location,
      budget_min,
      budget_max,
      sort,
      propertyType,   // single value e.g. "apartment"
      unitTypes,      // comma list e.g. "1bhk,2bhk"
      furnishing,
      possession,
    } = req.query;

    const minP = budget_min !== undefined && budget_min !== "" ? Number(budget_min) : undefined;
    const maxP = budget_max !== undefined && budget_max !== "" ? Number(budget_max) : undefined;

    const filters = [];
    const values = [];

    if (city)      { filters.push("LOWER(city) LIKE ?");      values.push(`%${city.toLowerCase()}%`); }
    if (location)  { filters.push("LOWER(location) LIKE ?");  values.push(`%${location.toLowerCase()}%`); }
    if (!Number.isNaN(minP)) { filters.push("price >= ?"); values.push(minP); }
    if (!Number.isNaN(maxP)) { filters.push("price <= ?"); values.push(maxP); }

    // 👇 CHANGE: use property_type instead of unit_type
    if (propertyType) { filters.push("LOWER(property_type) = ?"); values.push(propertyType.toLowerCase()); }
    if (furnishing)   { filters.push("LOWER(furnishing) = ?");    values.push(furnishing.toLowerCase()); }
    if (possession)   { filters.push("LOWER(possession) = ?");    values.push(possession.toLowerCase()); }

    // If you intend "unitTypes" to be the BHK like 1bhk/2bhk, map it to the actual column (e.g. bedrooms or bhk)
    if (unitTypes) {
      const typesArray = String(unitTypes)
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      // 👉 pick the right column: e.g. `bhk_label` or `bedrooms`
      // If you store numeric bedrooms, convert "1bhk" => 1, etc.
      // Example if you have a text column `bhk_label`:
      if (typesArray.length > 0) {
        filters.push(`LOWER(bhk_label) IN (${typesArray.map(() => "?").join(",")})`);
        values.push(...typesArray);
      }
    }

    const whereClause = filters.length ? " WHERE " + filters.join(" AND ") : "";
    let sql = `SELECT * FROM properties${whereClause}`;
    let finalValues = [...values];

    if (sort) {
      switch (sort) {
        case "low_to_high": sql += " ORDER BY price ASC"; break;
        case "high_to_low": sql += " ORDER BY price DESC"; break;
        case "medium":
          if (whereClause) {
            sql = `
              SELECT * FROM properties
              ${whereClause}
              ORDER BY ABS(price - (
                SELECT AVG(price) FROM properties ${whereClause}
              )) ASC
            `;
            // duplicate values once for the subquery
            finalValues = [...values, ...values];
          } else {
            sql = `
              SELECT * FROM properties
              ORDER BY ABS(price - (SELECT AVG(price) FROM properties)) ASC
            `;
            finalValues = [];
          }
          break;
        case "newest": sql += " ORDER BY created_at DESC"; break;
        default: sql += " ORDER BY price ASC";
      }
    } else {
      sql += " ORDER BY price ASC";
    }

    db.query(sql, finalValues, (err, results) => {
      if (err) {
        console.error("DB error:", err, { sql, finalValues });
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ data: results, count: results.length });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};





module.exports = {
  createProperty,
  getAllProperties,
  getProperty,
  updateProperty,
  deleteProperty,
  addPhotosToProperty,
  deletePhotosFromProperty,
  getMasterData,
  migratePropertyData,
  searchProperties
};
