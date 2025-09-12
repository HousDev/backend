// controllers/property.controller.js
const Property = require("../models/Property");
const MasterData = require("../models/masterModel");
const path = require("path");
const fs = require("fs");
const { slugifyTextParts } = require("../utils/slugify");
const db = require("../config/database");
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
  property_type_name: req.body.propertyType || req.body.property_type_name || null,
  property_subtype_name: req.body.propertySubtype || req.body.property_subtype_name || null,
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
  if (q.filterToken) return { token: String(q.filterToken), key: "filterToken" };
  if (q.fltcnt) return { token: String(q.fltcnt), key: "fltcnt" };
  if (q.filter_token) return { token: String(q.filter_token), key: "filter_token" };

  // heuristic search in query values for UUID-like or long token
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  for (const k of Object.keys(q)) {
    const v = q[k];
    if (!v) continue;
    if (typeof v === "string" && uuidRegex.test(v)) return { token: v, key: k };
    if (typeof v === "string" && v.length >= 20) return { token: v, key: k };
  }

  // check body as fallback
  const b = req.body || {};
  if (b.filterToken) return { token: String(b.filterToken), key: "filterToken" };
  if (b.fltcnt) return { token: String(b.fltcnt), key: "fltcnt" };
  if (b.filter_token) return { token: String(b.filter_token), key: "filter_token" };

  return { token: null, key: null };
}

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

    // Insert record (returns insertId)
    const propertyId = await Property.create(propertyData);

    // Build slug using id + slugified title parts
    const titlePart = slugifyTextParts(
      propertyData.property_type_name,
      propertyData.unit_type,
      propertyData.property_subtype_name,
      propertyData.city_name
    );
    const slug = `${propertyId}-${titlePart}`;

    // Update slug column
    try {
      await Property.updateSlug(propertyId, slug);
    } catch (slugErr) {
      // don't fail creation if slug update fails; log for investigation
      console.warn("Failed to update slug for property:", propertyId, slugErr && slugErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      data: {
        id: propertyId,
        slug,
        url: `/buy/projects/page/${slug}`,
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
      property_type_name: req.body.propertyType || req.body.property_type_name || null,
      property_subtype_name: req.body.propertySubtype || req.body.property_subtype_name || null,
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
        console.warn("Failed to update slug after property update:", slugErr && slugErr.message);
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

// GET by slug
const getPropertyBySlug = async (req, res) => {
  try {
    const slug = req.params.slug; // like "307185-g-square-dynasty-by-gsquare-in-mahabalipuram"
    const m = String(slug).match(/^(\d+)(?:-|$)/);
    if (!m) return res.status(400).json({ success: false, message: "Invalid slug format" });
    const id = Number(m[1]);
    const property = await Property.getById(id);
    if (!property) return res.status(404).json({ success: false, message: "Property not found" });

    // If stored slug exists and differs, redirect to canonical slug (preserve query)
    if (property.slug && property.slug !== slug) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      return res.redirect(301, `/buy/projects/page/${property.slug}${qs}`);
    }

    // capture client metadata (respect X-Forwarded-For)
    const xff = req.headers["x-forwarded-for"];
    const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
    const userAgent = req.get("User-Agent") || null;
    const referrer = req.get("Referrer") || req.get("Referer") || null;
    const sessionId = req.cookies?.session_id || null;

    // extract filter token (so visits with fltcnt or other keys are captured)
    const { token: extractedFilterToken, key: filterParamKey } = extractFilterTokenFromReq(req);

    // optionally record analytics (best-effort; non-blocking)
    try {
      // Build a small payload copy (avoid circular/non-serializable values)
      const safePayload = {
        query: req.query || {},
        filterToken: extractedFilterToken,
        filterParamKey: filterParamKey,
      };

      // call model method (Property.recordEvent) and PASS filterToken so it can be validated/saved
      const _evtResult = await Property.recordEvent({
        property_id: id,
        slug: property.slug || slug,
        event_type: "view",
        event_name: "page_view",
        payload: safePayload,
        ip: ip || null,
        user_agent: userAgent || null,
        referrer: referrer || null,
        session_id: sessionId || null,
        filterToken: extractedFilterToken,
        user_id: req.user?.id ?? null,
      });

      if (!(_evtResult && _evtResult.success)) {
        console.warn("analytics not saved:", _evtResult && _evtResult.error);
      }
    } catch (e) {
      console.warn("analytics error:", e && e.message);
    }

    res.json({ success: true, data: property });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const recordEventHandler = async (req, res) => {
  try {
    const idRaw = req.params.id;
    const propertyId = Number(idRaw);
    if (!propertyId || Number.isNaN(propertyId)) {
      return res.status(400).json({ success: false, message: "Missing or invalid property id" });
    }

    const {
      event_type = "custom",
      event_name = "unknown",
      payload = {},
      slug = null,
    } = req.body || {};

    // robust extraction of token (supports filterToken, fltcnt, etc.)
    const { token: extractedFilterToken, key: filterParamKey } = extractFilterTokenFromReq(req);

    // capture client metadata (respect X-Forwarded-For)
    const xff = req.headers["x-forwarded-for"];
    const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
    const userAgent = req.get("User-Agent") || null;
    const referrer = req.get("Referrer") || req.get("Referer") || null;
    const sessionId = req.cookies?.session_id || null;

    // merge token into payload for easier querying later
    const mergedPayload = {
      ...payload,
      filterToken: extractedFilterToken,
      filterParamKey,
      recorded_from: "api",
    };

    // call model method (best-effort) and PASS filterToken so ensureFilterToken runs
    const result = await Property.recordEvent({
      property_id: propertyId,
      slug: slug || null,
      event_type,
      event_name,
      payload: mergedPayload,
      ip,
      user_agent: userAgent,
      referrer,
      session_id: sessionId,
      filterToken: extractedFilterToken,
      user_id: req.user?.id ?? null,
    });

    // respond success; include whether analytics saved for debugging
    return res.json({
      success: true,
      message: "Event recorded (best-effort)",
      analyticsSaved: !!(result && result.success),
      metadata: {
        propertyId,
        event_type,
        event_name,
        filterParamKey,
        filterTokenPresent: !!extractedFilterToken
      },
    });
  } catch (err) {
    console.error("recordEventHandler failed:", err);
    // Do not leak internal error details, but return a 500
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ---------------------
// FILTER CONTEXT Handlers
// ---------------------

// POST /api/filters  -> body: { filters: object | JSON-string, user_id?: number }
const saveFilterContextHandler = async (req, res) => {
  try {
    const { filters, user_id = null } = req.body;
    if (!filters || (typeof filters !== "object" && typeof filters !== "string")) {
      return res.status(400).json({ success: false, message: "filters (object or JSON-string) required" });
    }
    const result = await Property.saveFilterContext(filters, user_id);
    if (!result || !result.success) return res.status(500).json({ success: false, message: "Failed to save filter context", error: result?.error });
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
    if (!id) return res.status(400).json({ success: false, message: "id required" });
    const ctx = await Property.getFilterContextById(id);
    if (!ctx) return res.status(404).json({ success: false, message: "Not found" });
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
  getFilterContextHandler
};
