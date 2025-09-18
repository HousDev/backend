// controllers/property.controller.js
const Property = require("../models/Property");
const MasterData = require("../models/masterModel");
const path = require("path");
const fs = require("fs");
const { slugifyTextParts } = require("../utils/slugify");
const db = require("../config/database");
const { publicFileUrl, fileRelPathFromUpload } = require("../utils/url");
const Views = require("../models/views.model");
const { getOrCreateSessionId } = require('../utils/sessionUtils');
const cookieParser = require('cookie-parser');
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
  seller_id: req.body.seller_id || null,
  assigned_to:  req.body.assigned_to || null,
  property_type_name:
    req.body.propertyType || req.body.property_type_name || null,
  property_subtype_name:
    req.body.propertySubtype || req.body.property_subtype_name || null,
  unit_type: req.body.unitType || req.body.unit_type || null,
  wing: req.body.wing || null,
  unit_no: req.body.unitNo || null,
  furnishing: req.body.furnishing || null,
  parking_type: req.body.parkingType || null,
  parking_qty: req.body.parkingQty || null,
  city_name: req.body.city || req.body.city_name || null,
  location_name: req.body.location || null,
  society_name: req.body.society_name || null,
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
// Filter token extractor (robust)
// ---------------------
/**
 * Returns { token: string|null, key: string|null }
 * Looks through query and body for common keys (filterToken, fltcnt, filter_token)
 * Falls back to the first UUID-shaped value or long-ish token if present.
 */
function extractFilterTokenFromReq(req) {
  const q = req.query || {};
  if (q.filterToken)
    return { token: String(q.filterToken), key: "filterToken" };
  if (q.fltcnt) return { token: String(q.fltcnt), key: "fltcnt" };
  if (q.filter_token)
    return { token: String(q.filter_token), key: "filter_token" };

  // heuristic search in query values for UUID-like or long token
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  for (const k of Object.keys(q)) {
    const v = q[k];
    if (!v) continue;
    if (typeof v === "string" && uuidRegex.test(v)) return { token: v, key: k };
    if (typeof v === "string" && v.length >= 20) return { token: v, key: k };
  }

  // check body as fallback
  const b = req.body || {};
  if (b.filterToken)
    return { token: String(b.filterToken), key: "filterToken" };
  if (b.fltcnt) return { token: String(b.fltcnt), key: "fltcnt" };
  if (b.filter_token)
    return { token: String(b.filter_token), key: "filter_token" };

  return { token: null, key: null };
}

// ---------------------
// Controller Functions
// ---------------------

// CREATE
// controller (e.g., controllers/propertyController.js)
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
    // Convert multer file objects to PUBLIC paths (keep your existing toPublic implementation)
    const ownershipDocPublic = req.files?.ownershipDoc?.[0]
      ? toPublic(req.files.ownershipDoc[0])
      : null;

    const photoPublicPaths = (req.files?.photos || []).map(toPublic);

    const propertyData = buildPropertyData(
      req,
      ownershipDocPublic,
      photoPublicPaths
    );

    // Insert record (returns insertId)
    const propertyId = await Property.create(propertyData);

    // normalize values (avoid undefined)
    const propertyType = propertyData.property_type_name || "";
    const unitType = propertyData.unit_type || "";
    const propertySubtype = propertyData.property_subtype_name || "";
    const locationName = propertyData.location_name || ""; // e.g., andheri
    const cityName = propertyData.city_name || ""; // e.g., mumbai

    // Use the new signature: slugifyTextParts(id, propertyType, unitType, propertySubtype, location, city)
    const titlePart = slugifyTextParts(
      propertyId,
      propertyType,
      unitType,
      propertySubtype,
      locationName,
      cityName
    );

    // If your slugify already prefixes id, ensure you don't double-prefix.
    // The function as provided includes id in the joined string, so use returned value directly:
    const slug = titlePart; // already contains id at start per new implementation

    // Update slug column
    try {
      await Property.updateSlug(propertyId, slug);
    } catch (slugErr) {
      // don't fail creation if slug update fails; log for investigation
      console.warn(
        "Failed to update slug for property:",
        propertyId,
        slugErr && slugErr.message
      );
    }

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: {
        id: propertyId,
        slug,
        url: `/properties/${slug}`,
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

// READ (single by id)
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
      property_type_name:
        req.body.propertyType || req.body.property_type_name || null,
      property_subtype_name:
        req.body.propertySubtype || req.body.property_subtype_name || null,
      unit_type: req.body.unitType || req.body.unit_type || null,
      wing: req.body.wing || null,
      unit_no: req.body.unitNo || null,
      furnishing: req.body.furnishing || null,
      parking_type: req.body.parkingType || null,
      parking_qty: req.body.parkingQty || null,
      city_name: req.body.city || req.body.city_name || null,
      location_name: req.body.location || null,
      society_name: req.body.society_name || null,
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

    // Recompute slug if any title fields present in request (optional)
    const maybeNewTitleParts = [
      req.body.propertyType || req.body.property_type_name,
      req.body.unitType || req.body.unit_type,
      req.body.propertySubtype || req.body.property_subtype_name,
      req.body.city || req.body.city_name,
    ].filter(Boolean);

    if (maybeNewTitleParts.length) {
      try {
        const titlePart = slugifyTextParts(...maybeNewTitleParts);
        const newSlug = `${id}-${titlePart}`;
        if (newSlug !== current.slug) {
          await Property.updateSlug(id, newSlug);
        }
      } catch (slugErr) {
        console.warn(
          "Failed to update slug after property update:",
          slugErr && slugErr.message
        );
      }
    }

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
      propertyType,
      propertySubtype,
      unitTypes,
      unitType,
      furnishing,
      possession,
      featured,
      verified,
      min_rating,
      parking,
      floor_min,
      floor_max,
      bathrooms,
      bedrooms,
      filter_token,
    } = req.query;

    const minP =
      budget_min !== undefined && budget_min !== ""
        ? Number(budget_min)
        : undefined;
    const maxP =
      budget_max !== undefined && budget_max !== ""
        ? Number(budget_max)
        : undefined;

    const filters = [];
    const values = [];

    // city (keep as partial match)
    if (city) {
      filters.push("LOWER(city) LIKE ?");
      values.push(`%${String(city).toLowerCase()}%`);
    }

    // --------- LOCATION: support CSV or repeated params; use OR of LIKEs ---------
    // req.query.location may be:
    // - "Baner" OR
    // - "Baner,Koregaon Park" OR
    // - an array like ['Baner','Koregaon Park'] depending on client
    if (location) {
      // Normalize: if it's array use it, else split on comma
      let locArr = [];
      if (Array.isArray(location)) {
        locArr = location.map((s) => String(s).trim()).filter(Boolean);
      } else {
        // decode and split by comma; some clients may pass encoded commas
        const raw = String(location);
        locArr = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      if (locArr.length === 1) {
        // single location: do a partial match (handles "Baner" and "Baner, Pune")
        filters.push("LOWER(location) LIKE ?");
        values.push(`%${locArr[0].toLowerCase()}%`);
      } else if (locArr.length > 1) {
        // multiple locations: create an OR group of LIKEs
        // e.g. (LOWER(location) LIKE ? OR LOWER(location) LIKE ?)
        const likePlaceholders = locArr.map(() => "LOWER(location) LIKE ?").join(" OR ");
        filters.push(`(${likePlaceholders})`);
        locArr.forEach((l) => values.push(`%${l.toLowerCase()}%`));
      }
    }

    // price range
    if (!Number.isNaN(minP)) {
      filters.push("price >= ?");
      values.push(minP);
    }
    if (!Number.isNaN(maxP)) {
      filters.push("price <= ?");
      values.push(maxP);
    }

    // propertyType (CSV allowed) - exact match on property_type column (case-insensitive)
    if (propertyType) {
      const arr = String(propertyType)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (arr.length === 1) {
        filters.push("LOWER(property_type) = ?");
        values.push(arr[0]);
      } else if (arr.length > 1) {
        filters.push(`LOWER(property_type) IN (${arr.map(() => "?").join(",")})`);
        values.push(...arr);
      }
    }

    // propertySubtype (CSV allowed)
    if (propertySubtype) {
      const arr = String(propertySubtype)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (arr.length === 1) {
        filters.push("LOWER(property_subtype) = ?");
        values.push(arr[0]);
      } else if (arr.length > 1) {
        filters.push(
          `LOWER(property_subtype) IN (${arr.map(() => "?").join(",")})`
        );
        values.push(...arr);
      }
    }

    // unitType(s) (legacy)
    const unitInput = unitType || unitTypes;
    if (unitInput) {
      const arr = String(unitInput)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (arr.length === 1) {
        filters.push("LOWER(unit_type) = ?");
        values.push(arr[0]);
      } else if (arr.length > 1) {
        filters.push(`LOWER(unit_type) IN (${arr.map(() => "?").join(",")})`);
        values.push(...arr);
      }
    }

    if (furnishing) {
      filters.push("LOWER(furnishing) = ?");
      values.push(String(furnishing).toLowerCase());
    }
    if (possession) {
      filters.push("LOWER(possession) = ?");
      values.push(String(possession).toLowerCase());
    }

    // featured (0/1)
    if (featured !== undefined) {
      filters.push("featured = ?");
      values.push(String(featured) === "1" || featured === true ? 1 : 0);
    }

    // verified (0/1)
    if (verified !== undefined) {
      filters.push("verified = ?");
      values.push(String(verified) === "1" || verified === true ? 1 : 0);
    }

    // min_rating
    if (min_rating !== undefined && min_rating !== "") {
      filters.push("rating >= ?");
      values.push(Number(min_rating));
    }

    // parking
    if (parking) {
      if (String(parking).toLowerCase() === "any") {
        filters.push("(parking_2w > 0 OR parking_4w > 0)");
      } else if (String(parking).toLowerCase() === "2w") {
        filters.push("parking_2w > 0");
      } else if (String(parking).toLowerCase() === "4w") {
        filters.push("parking_4w > 0");
      } else if (!isNaN(parking)) {
        filters.push("parking >= ?");
        values.push(Number(parking));
      }
    }

    // floor range
    if (floor_min !== undefined && floor_min !== "") {
      filters.push("floor >= ?");
      values.push(Number(floor_min));
    }
    if (floor_max !== undefined && floor_max !== "") {
      filters.push("floor <= ?");
      values.push(Number(floor_max));
    }

    // bathrooms
    if (bathrooms !== undefined && bathrooms !== "") {
      filters.push("bathrooms >= ?");
      values.push(Number(bathrooms));
    }

    // bedrooms (single or list)
    if (bedrooms) {
      const arr = String(bedrooms)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (arr.length === 1) {
        filters.push("bedrooms = ?");
        values.push(Number(arr[0]));
      } else if (arr.length > 1) {
        filters.push(`bedrooms IN (${arr.map(() => "?").join(",")})`);
        values.push(...arr.map((n) => Number(n)));
      }
    }

    // filter_token (if applicable)
    if (filter_token) {
      filters.push("filter_token = ?");
      values.push(String(filter_token));
    }

    // build SQL
    const whereClause = filters.length ? " WHERE " + filters.join(" AND ") : "";
    let sql = `SELECT * FROM properties${whereClause}`;
    let finalValues = [...values];

    // sorting
    if (sort) {
      switch (sort) {
        case "low_to_high":
          sql += " ORDER BY price ASC";
          break;
        case "high_to_low":
          sql += " ORDER BY price DESC";
          break;
        case "medium":
          if (whereClause) {
            // note: we use the same whereClause twice so duplicate params
            sql = `
              SELECT * FROM properties
              ${whereClause}
              ORDER BY ABS(price - (
                SELECT AVG(price) FROM properties ${whereClause}
              )) ASC
            `;
            finalValues = [...values, ...values]; // duplicate for inner SELECT
          } else {
            sql = `
              SELECT * FROM properties
              ORDER BY ABS(price - (SELECT AVG(price) FROM properties)) ASC
            `;
            finalValues = [];
          }
          break;
        case "newest":
          sql += " ORDER BY created_at DESC";
          break;
        default:
          sql += " ORDER BY price ASC";
      }
    } else {
      sql += " ORDER BY price ASC";
    }

    // execute
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




// GET by slug
const getPropertyBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const m = String(slug).match(/^(\d+)(?:-|$)/);
    if (!m)
      return res
        .status(400)
        .json({ success: false, message: "Invalid slug format" });
    
    const id = Number(m[1]);
    const property = await Property.getById(id);
    if (!property)
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });

    // If stored slug exists and differs, redirect to canonical slug (preserve query)
    if (property.slug && property.slug !== slug) {
      const qs = req.url.includes("?")
        ? req.url.slice(req.url.indexOf("?"))
        : "";
      return res.redirect(301, `/buy/projects/page/${property.slug}${qs}`);
    }

    // Capture client metadata (respect X-Forwarded-For)
    const xff = req.headers["x-forwarded-for"];
    const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
    const userAgent = req.get("User-Agent") || null;
    const referrer = req.get("Referrer") || req.get("Referer") || null;
    
    // *** GENERATE SESSION ID ***
    const sessionId = getOrCreateSessionId(req, res);

    // Extract filter token (so visits with fltcnt or other keys are captured)
    const { token: extractedFilterToken, key: filterParamKey } =
      extractFilterTokenFromReq(req);

    // *** RECORD VIEW ONLY ONCE PER SESSION ***
    try {
      // Build a small payload copy (avoid circular/non-serializable values)
      const safePayload = {
        query: req.query || {},
        filterToken: extractedFilterToken,
        filterParamKey: filterParamKey,
      };

      // Record view with session-based deduplication
      const _evtResult = await Property.recordEvent({
        property_id: id,
        slug: property.slug || slug,
        event_type: "view",
        event_name: "page_view",
        payload: safePayload,
        ip,
        user_agent: userAgent,
        referrer,
        session_id: sessionId, // Now properly set
        filterToken: extractedFilterToken,
        user_id: req.user?.id ?? null,
        dedupe_key: sessionId, // Use sessionId as dedupe key for same-session detection
        minutes_window: 1440, // 24 hours window for same session
      });

     
    } catch (e) {
      console.warn("analytics error:", e && e.message);
    }

    res.json({ success: true, data: property });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};


async function recordEventHandler(req, res) {
  try {
    // parse / validate property id
    const idRaw = req.params.id;
    const propertyId = idRaw
      ? Number(String(idRaw).replace(/[^0-9]/g, ""))
      : null;
    if (!propertyId || Number.isNaN(propertyId)) {
      // If you accept slug-only, handle accordingly — here we require numeric id
      return res
        .status(400)
        .json({ success: false, message: "Missing or invalid property id" });
    }

    // Compose payload safely from request body + request metadata
    const {
      source = req.body.source ?? "client",
      path = req.body.path ?? (typeof req !== "undefined" && req.path) ?? null,
      referrer = req.body.referrer ?? (req.get ? req.get("Referer") : null),
      slug = req.query.slug ?? req.body.slug ?? null,
      dedupe_key = req.body.dedupe_key ?? req.body.dedupeKey ?? null,
      session_id = req.body.session_id ?? req.body.sessionId ?? null,
      minutes_window = Number(
        req.body.minutes_window ?? req.body.windowMinutes ?? 1
      ),
      // any other custom fields...
    } = req.body || {};

    // include request-level metadata
    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    const userAgent = req.get
      ? req.get("User-Agent") || null
      : (req.headers && req.headers["user-agent"]) || null;

    // Build canonical payload for model
    const payload = {
      property_id: propertyId,
      slug: slug,
      source,
      path,
      referrer,
      dedupe_key,
      session_id,
      ip,
      user_agent: userAgent,
      minutes_window,
      event_type: "view",
    };

    // Ensure Views.recordView exists
    if (!Views || typeof Views.recordView !== "function") {
      console.error(
        "[recordEventHandler] Views.recordView not available",
        Object.keys(Views || {})
      );
      return res
        .status(500)
        .json({
          success: false,
          message: "Server misconfiguration (views model)",
        });
    }

    // Attempt to record (model should itself handle dedupe)
    const result = await Views.recordView(payload);
    // result { inserted: true/false, meta: {...} } as per suggested model
    return res.json({
      success: true,
      recorded: !!result.inserted,
      meta: result.meta || {},
    });
  } catch (err) {
    // robust error handling and logging (avoid referencing undeclared vars)
    console.error(
      "recordEventHandler failed:",
      err && err.stack ? err.stack : err
    );
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ---------------------
// FILTER CONTEXT Handlers
// ---------------------

// POST /api/filters  -> body: { filters: object | JSON-string, user_id?: number }
const saveFilterContextHandler = async (req, res) => {
  try {
    const { filters, user_id = null } = req.body;
    if (
      !filters ||
      (typeof filters !== "object" && typeof filters !== "string")
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "filters (object or JSON-string) required",
        });
    }
    const result = await Property.saveFilterContext(filters, user_id);
    if (!result || !result.success)
      return res
        .status(500)
        .json({
          success: false,
          message: "Failed to save filter context",
          error: result?.error,
        });
    return res.json({ success: true, id: result.id });
  } catch (err) {
    console.error("saveFilterContextHandler error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/filters/:id  -> debug / fetch filter context
const getFilterContextHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ success: false, message: "id required" });
    const ctx = await Property.getFilterContextById(id);
    if (!ctx)
      return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, context: ctx });
  } catch (err) {
    console.error("getFilterContextHandler error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
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
  searchProperties,
  getPropertyBySlug,
  recordEventHandler,
  saveFilterContextHandler,
  getFilterContextHandler,
};
