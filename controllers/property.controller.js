// // controllers/property.controller.js
// const Property = require("../models/Property");
// const MasterData = require("../models/masterModel");
// const path = require("path");
// const fs = require("fs");
// const { slugifyTextParts } = require("../utils/slugify");
// const db = require("../config/database");
// const { publicFileUrl, fileRelPathFromUpload } = require("../utils/url");
// const Views = require("../models/views.model");
// const { getOrCreateSessionId } = require('../utils/sessionUtils');
// const cookieParser = require('cookie-parser');

// // ---------------------
// // Helper Functions
// // ---------------------
// const parseArrayField = (field) => {
//   if (!field) return [];
//   if (Array.isArray(field)) return field;
//   if (typeof field === "string") {
//     try {
//       const parsed = JSON.parse(field);
//       return Array.isArray(parsed) ? parsed : [parsed];
//     } catch {
//       return field
//         .split(",")
//         .map((i) => i.trim())
//         .filter(Boolean);
//     }
//   }
//   return [];
// };

// const parseNearbyPlaces = (req) => {
//   if (Array.isArray(req.body.nearby_places)) return req.body.nearby_places;
//   if (
//     typeof req.body.nearby_places === "string" &&
//     req.body.nearby_places.trim() !== ""
//   ) {
//     try {
//       const parsed = JSON.parse(req.body.nearby_places);
//       if (Array.isArray(parsed)) return parsed;
//     } catch {
//       console.warn("Failed to parse nearby_places as JSON");
//     }
//   }
//   return [];
// };
// // --- Money parsers: "50L", "1.25Cr", "50,00,000", "5000000" -> number (rupees)
// const LAKH = 100_000;
// const CRORE = 10_000_000;

// function parseMoneyToRupees(value) {
//   if (value == null || value === "") return null;
//   const raw = String(value).trim().toLowerCase();
//   const cleaned = raw.replace(/₹/g, "").replace(/\s+/g, "");
//   const onlyDigits = cleaned.replace(/,/g, "");

//   if (/^\d+(\.\d+)?c(r)?$/.test(cleaned)) {
//     const n = parseFloat(cleaned.replace(/c(r)?/g, ""));
//     return Math.round(n * CRORE);
//   }
//   if (/^\d+(\.\d+)?l$/.test(cleaned)) {
//     const n = parseFloat(cleaned.replace(/l/g, ""));
//     return Math.round(n * LAKH);
//   }
//   if (/^\d+(\.\d+)?$/.test(onlyDigits)) {
//     return Math.round(parseFloat(onlyDigits));
//   }
//   return null;
// }

// const buildPropertyData = (req, ownershipDocPath, photoPaths) => ({
//   seller_name: req.body.seller || null,
//   seller_id: req.body.seller_id || null,
//   assigned_to: req.body.assigned_to || null,
//   property_type_name:
//     req.body.propertyType || req.body.property_type_name || null,
//   property_subtype_name:
//     req.body.propertySubtype || req.body.property_subtype_name || null,
//   unit_type: req.body.unitType || req.body.unit_type || null,
//   wing: req.body.wing || null,
//   unit_no: req.body.unitNo || null,
//   furnishing: req.body.furnishing || null,

//   // NEW
//   bedrooms: req.body.bedrooms != null ? Number(req.body.bedrooms) : null,
//   bathrooms: req.body.bathrooms != null ? Number(req.body.bathrooms) : null,
//   facing: req.body.facing || null,

//   parking_type: req.body.parkingType || null,
//   parking_qty: req.body.parkingQty || null,
//   city_name: req.body.city || req.body.city_name || null,
//   location_name: req.body.location || null,
//   society_name: req.body.society_name || null,
//   floor: req.body.floor || null,
//   total_floors: req.body.totalFloors || null,
//   carpet_area: req.body.carpetArea || null,
//   builtup_area: req.body.builtupArea || null,
//   budget: req.body.budget || null,

//   // NEW
//   price_type: req.body.priceType === "Negotiable" ? "Negotiable" : "Fixed",
//   final_price: parseMoneyToRupees(req.body.finalPrice),

//   address: req.body.address || null,
//   status: req.body.status || null,
//   lead_source: req.body.leadSource || null,
//   possession_month: req.body.possessionMonth || null,
//   possession_year: req.body.possessionYear || null,
//   purchase_month: req.body.purchaseMonth || null,
//   purchase_year: req.body.purchaseYear || null,
//   selling_rights: req.body.sellingRights || null,
//   ownership_doc_path: ownershipDocPath,
//   photos: photoPaths,
//   amenities: parseArrayField(req.body.amenities),
//   furnishing_items: parseArrayField(
//     req.body.furnishingItems || req.body.furnishing_items
//   ),
//   nearby_places: parseNearbyPlaces(req),
//   description: req.body.description || null,
// });

// // ---------------------
// // Small utils
// // ---------------------
// const safeJson = (s) => {
//   if (!s || typeof s !== "string") return undefined;
//   try {
//     return JSON.parse(s);
//   } catch {
//     return undefined;
//   }
// };

// // ✅ Always store PUBLIC path like createProperty
// const toPublic = (f) =>
//   "/uploads/properties/" +
//   (f.filename || path.basename(f.path)).replace(/\\/g, "/");

// // ---------------------
// // Filter token extractor (robust)
// // ---------------------
// /**
//  * Returns { token: string|null, key: string|null }
//  * Looks through query and body for common keys (filterToken, fltcnt, filter_token)
//  * Falls back to the first UUID-shaped value or long-ish token if present.
//  */
// function extractFilterTokenFromReq(req) {
//   const q = req.query || {};
//   if (q.filterToken)
//     return { token: String(q.filterToken), key: "filterToken" };
//   if (q.fltcnt) return { token: String(q.fltcnt), key: "fltcnt" };
//   if (q.filter_token)
//     return { token: String(q.filter_token), key: "filter_token" };

//   // heuristic search in query values for UUID-like or long token
//   const uuidRegex =
//     /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
//   for (const k of Object.keys(q)) {
//     const v = q[k];
//     if (!v) continue;
//     if (typeof v === "string" && uuidRegex.test(v)) return { token: v, key: k };
//     if (typeof v === "string" && v.length >= 20) return { token: v, key: k };
//   }

//   // check body as fallback
//   const b = req.body || {};
//   if (b.filterToken)
//     return { token: String(b.filterToken), key: "filterToken" };
//   if (b.fltcnt) return { token: String(b.fltcnt), key: "fltcnt" };
//   if (b.filter_token)
//     return { token: String(b.filter_token), key: "filter_token" };

//   return { token: null, key: null };
// }

// // ---------------------
// // Controller Functions

// const createProperty = async (req, res) => {


//   // Check if upload directory exists
//   const uploadDir = path.join(process.cwd(), "uploads", "properties");
//   if (req.files) {
//     Object.keys(req.files).forEach((key) => {
//       req.files[key].forEach((file) => {
//       });
//     });
//   }

//   try {
//     // Convert multer file objects to PUBLIC paths (keep your existing toPublic implementation)
//     // const ownershipDocPublic = req.files?.ownershipDoc?.[0]
//     //   ? toPublic(req.files.ownershipDoc[0])
//     //   : null;
//     const ownershipDocPublic = req.files?.ownershipDoc?.[0]
//       ? req.files.ownershipDoc[0].publicUrl ||
//         toPublic(req.files.ownershipDoc[0])
//       : null;

//     // const photoPublicPaths = (req.files?.photos || []).map(toPublic);
// const photoPublicPaths = (req.files?.photos || []).map(
//   (f) => f.publicUrl || toPublic(f)
// );
//     const propertyData = buildPropertyData(
//       req,
//       ownershipDocPublic,
//       photoPublicPaths
//     );

//     // Insert record (returns insertId)
//     const propertyId = await Property.create(propertyData);

//     // normalize values (avoid undefined)
//     const propertyType = propertyData.property_type_name || "";
//     const unitType = propertyData.unit_type || "";
//     const propertySubtype = propertyData.property_subtype_name || "";
//     const locationName = propertyData.location_name || ""; // e.g., andheri
//     const cityName = propertyData.city_name || ""; // e.g., mumbai

//     // Use the new signature: slugifyTextParts(id, propertyType, unitType, propertySubtype, location, city)
//     const titlePart = slugifyTextParts(
//       propertyId,
//       propertyType,
//       unitType,
//       propertySubtype,
//       locationName,
//       cityName
//     );

//     // If your slugify already prefixes id, ensure you don't double-prefix.
//     // The function as provided includes id in the joined string, so use returned value directly:
//     const slug = titlePart; // already contains id at start per new implementation

//     // Update slug column
//     try {
//       await Property.updateSlug(propertyId, slug);
//     } catch (slugErr) {
//       // don't fail creation if slug update fails; log for investigation
//       console.warn(
//         "Failed to update slug for property:",
//         propertyId,
//         slugErr && slugErr.message
//       );
//     }

//     res.status(201).json({
//       success: true,
//       message: "Property created successfully",
//       data: {
//         id: propertyId,
//         slug,
//         url: `/properties/${slug}`,
//         uploadedFiles: {
//           ownershipDoc: ownershipDocPublic ? 1 : 0,
//           photos: photoPublicPaths.length,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Create failed:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to create property",
//       error: error.message,
//     });
//   }
// };

// // READ (all)
// const getAllProperties = async (req, res) => {
//   try {
//     const properties = await Property.getAll();
//     res.json({ success: true, data: properties });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch properties",
//       error: error.message,
//     });
//   }
// };

// // READ (single by id)
// const getProperty = async (req, res) => {
//   try {
//     const property = await Property.getById(req.params.id);
//     if (!property)
//       return res
//         .status(404)
//         .json({ success: false, message: "Property not found" });
//     res.json({ success: true, data: property });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch property",
//       error: error.message,
//     });
//   }
// };

// // UPDATE — preserves existing photos/doc, merges new uploads, stores public paths
// const updateProperty = async (req, res) => {
//   try {
//     const id = req.params.id;

//     // 1) Current record for fallbacks
//     const current = await Property.getById(id);
//     if (!current) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Property not found" });
//     }

//     // 2) Parse existing photos from body (JSON string array)
//     const bodyExistingA = safeJson(req.body.existingPhotoUrls);
//     const bodyExistingB = safeJson(req.body.existingPhotos);
//     const existingFromBody = Array.isArray(bodyExistingA)
//       ? bodyExistingA
//       : Array.isArray(bodyExistingB)
//       ? bodyExistingB
//       : undefined; // not provided

//     // 3) New uploads -> public paths
//     const uploadedPhotoPublic = (req.files?.photos || []).map(toPublic);

//     // 4) Merge strategy toggle (support both flags)
//     const wantsMerge =
//       String(req.body.mergePhotos).toLowerCase() === "true" ||
//       String(req.body.appendPhotos).toLowerCase() === "true";

//     // 5) Decide final photos
//     const baseExisting = Array.isArray(existingFromBody)
//       ? existingFromBody
//       : Array.isArray(current.photos)
//       ? current.photos
//       : [];

//     let finalPhotos;
//     if (wantsMerge) {
//       finalPhotos = [...baseExisting, ...uploadedPhotoPublic];
//     } else if (
//       Array.isArray(existingFromBody) ||
//       uploadedPhotoPublic.length > 0
//     ) {
//       finalPhotos = [...baseExisting, ...uploadedPhotoPublic];
//     } else {
//       // nothing specified — preserve current
//       finalPhotos = Array.isArray(current.photos) ? current.photos : [];
//     }

//     // 6) Ownership document
//     const uploadedDocPublic = req.files?.ownershipDoc?.[0]
//       ? toPublic(req.files.ownershipDoc[0])
//       : null;

//     const existingDocFromBody =
//       req.body.existingOwnershipDocUrl || req.body.existingOwnershipDoc || null;

//     const finalOwnershipDoc =
//       uploadedDocPublic !== null
//         ? uploadedDocPublic
//         : existingDocFromBody !== null
//         ? existingDocFromBody
//         : current.ownership_doc_path || null;

//     // 7) Build payload (normalize)
//     const propertyData = {
//       seller_name: req.body.seller || null,
//       property_type_name:
//         req.body.propertyType || req.body.property_type_name || null,
//       property_subtype_name:
//         req.body.propertySubtype || req.body.property_subtype_name || null,
//       unit_type: req.body.unitType || req.body.unit_type || null,
//       wing: req.body.wing || null,
//       unit_no: req.body.unitNo || null,
//       furnishing: req.body.furnishing || null,

//       bedrooms: req.body.bedrooms != null ? Number(req.body.bedrooms) : null,
//       bathrooms: req.body.bathrooms != null ? Number(req.body.bathrooms) : null,
//       facing: req.body.facing || null,
//       price_type: req.body.priceType === "Negotiable" ? "Negotiable" : "Fixed",
//       final_price: parseMoneyToRupees(req.body.finalPrice),

//       parking_type: req.body.parkingType || null,
//       parking_qty: req.body.parkingQty || null,
//       city_name: req.body.city || req.body.city_name || null,
//       location_name: req.body.location || null,
//       society_name: req.body.society_name || null,
//       floor: req.body.floor || null,
//       total_floors: req.body.totalFloors || null,
//       carpet_area: req.body.carpetArea || null,
//       builtup_area: req.body.builtupArea || null,
//       budget: req.body.budget || null,
//       address: req.body.address || null,
//       status: req.body.status || null,
//       lead_source: req.body.leadSource || null,
//       possession_month: req.body.possessionMonth || null,
//       possession_year: req.body.possessionYear || null,
//       purchase_month: req.body.purchaseMonth || null,
//       purchase_year: req.body.purchaseYear || null,
//       selling_rights: req.body.sellingRights || null,

//       // 🔒 preserve/merge results
//       ownership_doc_path: finalOwnershipDoc,
//       photos: finalPhotos,

//       amenities: parseArrayField(req.body.amenities),
//       furnishing_items: parseArrayField(
//         req.body.furnishingItems || req.body.furnishing_items
//       ),
//       nearby_places: parseNearbyPlaces(req),
//       description: req.body.description || null,
//     };

//     await Property.update(id, propertyData);

//     // Recompute slug if any title fields present in request (optional)
//     const maybeNewTitleParts = [
//       req.body.propertyType || req.body.property_type_name,
//       req.body.unitType || req.body.unit_type,
//       req.body.propertySubtype || req.body.property_subtype_name,
//       req.body.city || req.body.city_name,
//     ].filter(Boolean);

//     if (maybeNewTitleParts.length) {
//       try {
//         const titlePart = slugifyTextParts(...maybeNewTitleParts);
//         const newSlug = `${id}-${titlePart}`;
//         if (newSlug !== current.slug) {
//           await Property.updateSlug(id, newSlug);
//         }
//       } catch (slugErr) {
//         console.warn(
//           "Failed to update slug after property update:",
//           slugErr && slugErr.message
//         );
//       }
//     }

//     return res.json({
//       success: true,
//       message: "Property updated successfully",
//       data: {
//         id,
//         updatedFiles: {
//           ownershipDoc: uploadedDocPublic ? 1 : 0,
//           photos: uploadedPhotoPublic.length,
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Update failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to update property",
//       error: error.message,
//     });
//   }
// };

// // DELETE
// const deleteProperty = async (req, res) => {
//   try {
//     await Property.delete(req.params.id);
//     res.json({ success: true, message: "Property deleted successfully" });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to delete property",
//       error: error.message,
//     });
//   }
// };

// // ADD MORE PHOTOS TO EXISTING PROPERTY (public URLs)
// const addPhotosToProperty = async (req, res) => {
//   try {
//     const photoPublicPaths = (req.files?.photos || []).map(toPublic);

//     if (photoPublicPaths.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No photos provided",
//       });
//     }

//     await Property.addPhotos(req.params.id, photoPublicPaths);

//     res.json({
//       success: true,
//       message: `${photoPublicPaths.length} photos added successfully`,
//       data: {
//         addedPhotos: photoPublicPaths.length,
//       },
//     });
//   } catch (error) {
//     console.error("Add photos failed:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to add photos",
//       error: error.message,
//     });
//   }
// };

// // DELETE PHOTOS FROM PROPERTY
// const deletePhotosFromProperty = async (req, res) => {
//   try {
//     const { photoUrls } = req.body; // Array of photo URLs to delete

//     if (!photoUrls || !Array.isArray(photoUrls)) {
//       return res.status(400).json({
//         success: false,
//         message: "Please provide array of photo URLs to delete",
//       });
//     }

//     await Property.deleteSpecificPhotos(req.params.id, photoUrls);

//     res.json({
//       success: true,
//       message: `Photos deleted successfully`,
//       data: {
//         deletedCount: photoUrls.length,
//       },
//     });
//   } catch (error) {
//     console.error("Delete photos failed:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to delete photos",
//       error: error.message,
//     });
//   }
// };

// // MASTER DATA
// const getMasterData = async (req, res) => {
//   try {
//     const masterData = await MasterData.getAll();
//     res.json({ success: true, data: masterData });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch master data",
//       error: error.message,
//     });
//   }
// };

// // MIGRATE
// const migratePropertyData = async (req, res) => {
//   try {
//     const result = await Property.migrateData();
//     res.json({ success: true, message: "Migration complete", data: result });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Migration failed",
//       error: error.message,
//     });
//   }
// };


// const searchProperties = (req, res) => {
//   try {
//     let {
//       city,
//       location,
//       locations,
//       budget_min,
//       budget_max,
//       sort,
//       propertyType,
//       propertySubtype,
//       unitTypes,
//       unitType,
//       furnishing,
//       verified,
//       parking,
//       floor_min,
//       floor_max,
//       bathrooms,
//       bedrooms,
//       status,  // Map this to actual boolean columns
//       is_public,
//       isPublic,
//       visibility,
//       publicOnly,
//     } = req.query;

//     const PRICE_COL = 'budget';

//     const toNumOrNull = (v) => {
//       if (v === undefined || v === null || v === '') return null;
//       const n = Number(v);
//       return Number.isFinite(n) ? n : null;
//     };

//     const normalizePropertyType = (s) => {
//       if (!s) return s;
//       const t = String(s).trim().toLowerCase();
//       if (/^residential/.test(t)) return 'Residential';
//       if (/^commercial/.test(t))  return 'Commercial';
//       if (/agri|agric|farm|land/.test(t)) return 'Agriculture Land';
//       return s.toString().trim();
//     };

//     const minP = toNumOrNull(budget_min);
//     const maxP = toNumOrNull(budget_max);

//     const filters = [];
//     const values = [];

//     // city_name (partial, case-insensitive)
//     if (city) {
//       filters.push('LOWER(city_name) LIKE ?');
//       values.push(`%${String(city).toLowerCase()}%`);
//     }

//     // location_name (CSV/array; OR of LIKEs)
//     const locInput = (location !== undefined ? location : locations);
//     if (locInput) {
//       let locArr = [];
//       if (Array.isArray(locInput)) {
//         locArr = locInput.map((s) => String(s).trim()).filter(Boolean);
//       } else {
//         locArr = String(locInput).split(',').map((s) => s.trim()).filter(Boolean);
//       }
//       if (locArr.length === 1) {
//         filters.push('LOWER(location_name) LIKE ?');
//         values.push(`%${locArr[0].toLowerCase()}%`);
//       } else if (locArr.length > 1) {
//         const likePlaceholders = locArr.map(() => 'LOWER(location_name) LIKE ?').join(' OR ');
//         filters.push(`(${likePlaceholders})`);
//         locArr.forEach((l) => values.push(`%${l.toLowerCase()}%`));
//       }
//     }

//     // budget range
//     if (minP !== null) { filters.push(`${PRICE_COL} >= ?`); values.push(minP); }
//     if (maxP !== null) { filters.push(`${PRICE_COL} <= ?`); values.push(maxP); }

//     // property_type_name
//     if (propertyType) {
//       const arr = String(propertyType)
//         .split(',')
//         .map((s) => normalizePropertyType(s))
//         .map((s) => s.trim().toLowerCase())
//         .filter(Boolean);
//       if (arr.length === 1) { filters.push('LOWER(property_type_name) = ?'); values.push(arr[0]); }
//       else if (arr.length > 1) { filters.push(`LOWER(property_type_name) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
//     }

//     // property_subtype_name
//     if (propertySubtype) {
//       const arr = String(propertySubtype).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
//       if (arr.length === 1) { filters.push('LOWER(property_subtype_name) = ?'); values.push(arr[0]); }
//       else if (arr.length > 1) { filters.push(`LOWER(property_subtype_name) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
//     }

//     // unit_type (supports unitType or unitTypes)
//     const unitInput = unitType || unitTypes;
//     if (unitInput) {
//       const arr = String(unitInput).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
//       if (arr.length === 1) { filters.push('LOWER(unit_type) = ?'); values.push(arr[0]); }
//       else if (arr.length > 1) { filters.push(`LOWER(unit_type) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
//     }

//     // furnishing
//     if (furnishing) {
//       filters.push('LOWER(furnishing) = ?');
//       values.push(String(furnishing).toLowerCase());
//     }

//     // verified
//     if (verified !== undefined) {
//       filters.push('is_verified = ?');
//       values.push(String(verified) === '1' || verified === true ? 1 : 0);
//     }

//     // ✅ FIX: Handle is_public filter (supports multiple param names)
//     const publicParam = is_public || isPublic || visibility || publicOnly;
//     if (publicParam !== undefined) {
//       // Handle various formats: true, "true", "1", 1, "public"
//       const isPublicValue = 
//         publicParam === true || 
//         publicParam === 1 || 
//         String(publicParam).toLowerCase() === 'true' || 
//         String(publicParam) === '1' || 
//         String(publicParam).toLowerCase() === 'public';
      
//       filters.push('is_public = ?');
//       values.push(isPublicValue ? 1 : 0);
//     }

//     // ✅ FIX: Map "status" to actual boolean columns
//     if (status) {
//       const statusLower = String(status).toLowerCase();
//       switch(statusLower) {
//         case 'available':
//           filters.push('is_available = 1');
//           filters.push('is_sold = 0');
//           break;
//         case 'sold':
//           filters.push('is_sold = 1');
//           break;
//         case 'new':
//         case 'new listing':
//           filters.push('is_new_listing = 1');
//           break;
//         case 'premium':
//           filters.push('is_premium = 1');
//           break;
//         case 'featured':
//           filters.push('is_featured = 1');
//           break;
//         default:
//           // If status doesn't match any known value, ignore it
//           console.warn(`Unknown status value: ${status}`);
//       }
//     }

//     // parking (parking_type / parking_qty)
//     if (parking) {
//       const p = String(parking).toLowerCase();
//       if (p === 'any') {
//         filters.push('(parking_qty IS NOT NULL AND parking_qty > 0)');
//       } else if (p === '2w' || p.includes('2')) {
//         filters.push("(LOWER(parking_type) LIKE '%2w%' OR LOWER(parking_type) LIKE '%two%')");
//       } else if (p === '4w' || p.includes('4')) {
//         filters.push("(LOWER(parking_type) LIKE '%4w%' OR LOWER(parking_type) LIKE '%four%' OR LOWER(parking_type) LIKE '%car%')");
//       } else {
//         const pn = toNumOrNull(parking);
//         if (pn !== null) {
//           filters.push('parking_qty >= ?');
//           values.push(pn);
//         }
//       }
//     }

//     // floor range
//     const floorMin = toNumOrNull(floor_min);
//     const floorMax = toNumOrNull(floor_max);
//     if (floorMin !== null) { filters.push('floor >= ?'); values.push(floorMin); }
//     if (floorMax !== null) { filters.push('floor <= ?'); values.push(floorMax); }

//     // bathrooms / bedrooms
//     const baths = toNumOrNull(bathrooms);
//     if (baths !== null) { filters.push('bathrooms >= ?'); values.push(baths); }

//     if (bedrooms) {
//       const arr = String(bedrooms).split(',').map((s) => s.trim()).filter(Boolean);
//       if (arr.length === 1) {
//         const b = toNumOrNull(arr[0]);
//         if (b !== null) { filters.push('bedrooms = ?'); values.push(b); }
//       } else if (arr.length > 1) {
//         const nums = arr.map((n) => toNumOrNull(n)).filter((n) => n !== null);
//         if (nums.length) { filters.push(`bedrooms IN (${nums.map(() => '?').join(',')})`); values.push(...nums); }
//       }
//     }

//     const whereClause = filters.length ? ' WHERE ' + filters.join(' AND ') : '';

//     const SELECT_COLUMNS = `
//       id,
//       seller_name, seller_id, lead_id, assigned_to,
//       property_type_name, property_subtype_name, unit_type, wing, unit_no,
//       furnishing, bedrooms, bathrooms, facing, parking_type, parking_qty,
//       city_name, location_name, society_name, floor, total_floors,
//       carpet_area, builtup_area,
//       budget, price_type, final_price,
//       address, status, lead_source,
//       possession_month, possession_year, purchase_month, purchase_year,
//       selling_rights, ownership_doc_path,
//       photos, amenities, furnishing_items, nearby_places, description,
//       created_at, updated_at,
//       is_public, is_private, is_sold, is_available, is_new_listing, is_premium, is_verified, is_featured,
//       publication_date, created_by, updated_by,
//       public_views, public_inquiries,
//       slug
//     `.replace(/\s+/g, ' ').trim();

//     let sql = `SELECT ${SELECT_COLUMNS} FROM my_properties${whereClause}`;
//     let finalValues = [...values];

//     // sorting
//     if (sort) {
//       switch (sort) {
//         case 'low_to_high':
//           sql += ` ORDER BY ${PRICE_COL} ASC`;
//           break;
//         case 'high_to_low':
//           sql += ` ORDER BY ${PRICE_COL} DESC`;
//           break;
//         case 'medium': {
//           if (whereClause) {
//             sql = `
//               SELECT ${SELECT_COLUMNS} FROM my_properties
//               ${whereClause}
//               ORDER BY ABS(${PRICE_COL} - (
//                 SELECT AVG(${PRICE_COL}) FROM my_properties ${whereClause}
//               )) ASC
//             `;
//             finalValues = [...values, ...values];
//           } else {
//             sql = `
//               SELECT ${SELECT_COLUMNS} FROM my_properties
//               ORDER BY ABS(${PRICE_COL} - (SELECT AVG(${PRICE_COL}) FROM my_properties)) ASC
//             `;
//             finalValues = [];
//           }
//           break;
//         }
//         case 'newest':
//           sql += ' ORDER BY created_at DESC';
//           break;
//         default:
//           sql += ` ORDER BY ${PRICE_COL} ASC`;
//       }
//     } else {
//       sql += ` ORDER BY ${PRICE_COL} ASC`;
//     }

//     // 🔍 Debug logging
//     console.log('SQL Query:', sql);
//     console.log('Values:', finalValues);

//     db.query(sql, finalValues, (err, results) => {
//       if (err) {
//         console.error('DB error:', err, { sql, finalValues });
//         return res.status(500).json({ success: false, error: 'Database error' });
//       }
//       res.json({ success: true, data: results, count: results.length });
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, error: 'Server error' });
//   }
// };







// // GET by slug
// const getPropertyBySlug = async (req, res) => {
//   try {
//     const slug = req.params.slug;
//     const m = String(slug).match(/^(\d+)(?:-|$)/);
//     if (!m)
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid slug format" });
    
//     const id = Number(m[1]);
//     const property = await Property.getById(id);
//     if (!property)
//       return res
//         .status(404)
//         .json({ success: false, message: "Property not found" });

//     // If stored slug exists and differs, redirect to canonical slug (preserve query)
//     if (property.slug && property.slug !== slug) {
//       const qs = req.url.includes("?")
//         ? req.url.slice(req.url.indexOf("?"))
//         : "";
//       return res.redirect(301, `/buy/projects/page/${property.slug}${qs}`);
//     }

//     // Capture client metadata (respect X-Forwarded-For)
//     const xff = req.headers["x-forwarded-for"];
//     const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
//     const userAgent = req.get("User-Agent") || null;
//     const referrer = req.get("Referrer") || req.get("Referer") || null;
    
//     // *** GENERATE SESSION ID ***
//     const sessionId = getOrCreateSessionId(req, res);

//     // Extract filter token (so visits with fltcnt or other keys are captured)
//     const { token: extractedFilterToken, key: filterParamKey } =
//       extractFilterTokenFromReq(req);

//     // *** RECORD VIEW ONLY ONCE PER SESSION ***
//     try {
//       // Build a small payload copy (avoid circular/non-serializable values)
//       const safePayload = {
//         query: req.query || {},
//         filterToken: extractedFilterToken,
//         filterParamKey: filterParamKey,
//       };

//       // Record view with session-based deduplication
//       const _evtResult = await Property.recordEvent({
//         property_id: id,
//         slug: property.slug || slug,
//         event_type: "view",
//         event_name: "page_view",
//         payload: safePayload,
//         ip,
//         user_agent: userAgent,
//         referrer,
//         session_id: sessionId, // Now properly set
//         filterToken: extractedFilterToken,
//         user_id: req.user?.id ?? null,
//         dedupe_key: sessionId, // Use sessionId as dedupe key for same-session detection
//         minutes_window: 1440, // 24 hours window for same session
//       });

     
//     } catch (e) {
//       console.warn("analytics error:", e && e.message);
//     }

//     res.json({ success: true, data: property });
//   } catch (error) {
//     console.error(error);
//     res
//       .status(500)
//       .json({ success: false, message: "Server error", error: error.message });
//   }
// };


// async function recordEventHandler(req, res) {
//   try {
//     // parse / validate property id
//     const idRaw = req.params.id;
//     const propertyId = idRaw
//       ? Number(String(idRaw).replace(/[^0-9]/g, ""))
//       : null;
//     if (!propertyId || Number.isNaN(propertyId)) {
//       // If you accept slug-only, handle accordingly — here we require numeric id
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing or invalid property id" });
//     }

//     // Compose payload safely from request body + request metadata
//     const {
//       source = req.body.source ?? "client",
//       path = req.body.path ?? (typeof req !== "undefined" && req.path) ?? null,
//       referrer = req.body.referrer ?? (req.get ? req.get("Referer") : null),
//       slug = req.query.slug ?? req.body.slug ?? null,
//       dedupe_key = req.body.dedupe_key ?? req.body.dedupeKey ?? null,
//       session_id = req.body.session_id ?? req.body.sessionId ?? null,
//       minutes_window = Number(
//         req.body.minutes_window ?? req.body.windowMinutes ?? 1
//       ),
//       // any other custom fields...
//     } = req.body || {};

//     // include request-level metadata
//     const ip = req.ip || req.headers["x-forwarded-for"] || null;
//     const userAgent = req.get
//       ? req.get("User-Agent") || null
//       : (req.headers && req.headers["user-agent"]) || null;

//     // Build canonical payload for model
//     const payload = {
//       property_id: propertyId,
//       slug: slug,
//       source,
//       path,
//       referrer,
//       dedupe_key,
//       session_id,
//       ip,
//       user_agent: userAgent,
//       minutes_window,
//       event_type: "view",
//     };

//     // Ensure Views.recordView exists
//     if (!Views || typeof Views.recordView !== "function") {
//       console.error(
//         "[recordEventHandler] Views.recordView not available",
//         Object.keys(Views || {})
//       );
//       return res
//         .status(500)
//         .json({
//           success: false,
//           message: "Server misconfiguration (views model)",
//         });
//     }

//     // Attempt to record (model should itself handle dedupe)
//     const result = await Views.recordView(payload);
//     // result { inserted: true/false, meta: {...} } as per suggested model
//     return res.json({
//       success: true,
//       recorded: !!result.inserted,
//       meta: result.meta || {},
//     });
//   } catch (err) {
//     // robust error handling and logging (avoid referencing undeclared vars)
//     console.error(
//       "recordEventHandler failed:",
//       err && err.stack ? err.stack : err
//     );
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// }

// // ---------------------
// // FILTER CONTEXT Handlers
// // ---------------------

// // POST /api/filters  -> body: { filters: object | JSON-string, user_id?: number }
// const saveFilterContextHandler = async (req, res) => {
//   try {
//     const { filters, user_id = null } = req.body;
//     if (
//       !filters ||
//       (typeof filters !== "object" && typeof filters !== "string")
//     ) {
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "filters (object or JSON-string) required",
//         });
//     }
//     const result = await Property.saveFilterContext(filters, user_id);
//     if (!result || !result.success)
//       return res
//         .status(500)
//         .json({
//           success: false,
//           message: "Failed to save filter context",
//           error: result?.error,
//         });
//     return res.json({ success: true, id: result.id });
//   } catch (err) {
//     console.error("saveFilterContextHandler error:", err);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// // GET /api/filters/:id  -> debug / fetch filter context
// const getFilterContextHandler = async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!id)
//       return res.status(400).json({ success: false, message: "id required" });
//     const ctx = await Property.getFilterContextById(id);
//     if (!ctx)
//       return res.status(404).json({ success: false, message: "Not found" });
//     return res.json({ success: true, context: ctx });
//   } catch (err) {
//     console.error("getFilterContextHandler error:", err);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };
// // POST /api/properties/search/city-locations
// // const searchCityLocationsStrict = async (req, res) => {
// //   try {
   
    
// //     // Get city from query parameters
// //     const cityInput = (req.query.city || req.query.city_name || "").toString().trim();
  
    
// //     // Validate city is provided
// //     if (!cityInput) {
     
// //       return res.status(400).json({
// //         success: false,
// //         message: "City parameter is required"
// //       });
// //     }
    
    
// //     // Get locations from query parameters
// //     let locationsInput = req.query.locations || req.query.location_name || "";
    
// //     // Process locations input
// //     let locArr = [];
// //     if (locationsInput) {
     
// //       if (typeof locationsInput === "string") {
// //         locArr = locationsInput.split(",").map(s => s.trim()).filter(Boolean);
// //       } else if (Array.isArray(locationsInput)) {
// //         locArr = locationsInput.map(s => String(s).trim()).filter(Boolean);
// //       }
      
// //       // Normalize: lowercase, remove duplicates, limit to 5 locations
// //       locArr = Array.from(new Set(locArr.map(s => s.toLowerCase()))).slice(0, 5);
// //     }
    
  
    
// //     // Pagination parameters
// //     const limit = Math.min(Number(req.query.limit) || 50, 200);
// //     const offset = Number(req.query.offset) || 0;
    
   
    
// //     // Build SQL query
// //     const filters = [];
// //     const values = [];
    
// //     // Add city filter (case-insensitive exact match)
// //     filters.push("LOWER(TRIM(city_name)) = ?");
// //     values.push(cityInput.toLowerCase());
   
    
// //     // Add location filter if locations provided
// //     if (locArr.length > 0) {
// //       const locationConditions = locArr.map(() => "LOWER(TRIM(location_name)) LIKE ?").join(" OR ");
// //       filters.push(`(${locationConditions})`);
// //       locArr.forEach(loc => values.push(`%${loc}%`));
     
// //     }
    
// //     // Build WHERE clause
// //     const whereClause = filters.length > 0 ? " WHERE " + filters.join(" AND ") : "";
    
  
    
// //     // Count query
// //     const countSql = `SELECT COUNT(*) AS total FROM my_properties${whereClause}`;
   
    
// //     // Execute count query using async/await
// //     const [countRows] = await db.query(countSql, values);

    
// //     const total = countRows?.[0]?.total || 0;
    
    
// //     // Data query with sorting
// //     const dataSql = `
// //       SELECT * FROM my_properties
// //       ${whereClause}
// //       ORDER BY updated_at DESC, created_at DESC
// //       LIMIT ? OFFSET ?
// //     `;
// //     const dataValues = [...values, limit, offset];
    
    
// //     // Execute data query using async/await
// //     const [dataRows] = await db.query(dataSql, dataValues);
    
// //     // Return successful response
// //     return res.json({
// //       success: true,
// //       city: cityInput,
// //       locations: locArr.length > 0 ? locArr : null,
// //       count: dataRows.length,
// //       total: total,
// //       limit: limit,
// //       offset: offset,
// //       data: dataRows
// //     });
    
// //   } catch (error) {
// //     console.error("❌ Search properties error:", error);
// //     console.error("Stack trace:", error.stack);
// //     return res.status(500).json({
// //       success: false,
// //       message: "Internal server error",
// //       error: error.message
// //     });
// //   }
// // };

// const searchCityLocationsStrict = async (req, res) => {
//   try {
//     // Get city from query parameters
//     const cityInput = (req.query.city || req.query.city_name || "").toString().trim();
    
//     // Validate city is provided
//     if (!cityInput) {
//       return res.status(400).json({
//         success: false,
//         message: "City parameter is required"
//       });
//     }
    
//     // Get locations from query parameters
//     let locationsInput = req.query.locations || req.query.location_name || "";
    
//     // Process locations input
//     let locArr = [];
//     if (locationsInput) {
//       if (typeof locationsInput === "string") {
//         locArr = locationsInput.split(",").map(s => s.trim()).filter(Boolean);
//       } else if (Array.isArray(locationsInput)) {
//         locArr = locationsInput.map(s => String(s).trim()).filter(Boolean);
//       }
      
//       // Normalize: lowercase, remove duplicates, limit to 5 locations
//       locArr = Array.from(new Set(locArr.map(s => s.toLowerCase()))).slice(0, 5);
//     }
    
//     // Get other filters
//     const propertyType = (req.query.propertyType || req.query.property_type || "").toString().trim();
//     const status = (req.query.status || "").toString().trim();
    
//     // Pagination parameters
//     const limit = Math.min(Number(req.query.limit) || 50, 200);
//     const offset = Number(req.query.offset) || 0;
    
//     // Build SQL query
//     const filters = [];
//     const values = [];
    
//     // Add city filter (case-insensitive exact match)
//     filters.push("LOWER(TRIM(city_name)) = ?");
//     values.push(cityInput.toLowerCase());
    
//     // Add location filter if locations provided
//     if (locArr.length > 0) {
//       const locationConditions = locArr.map(() => "LOWER(TRIM(location_name)) LIKE ?").join(" OR ");
//       filters.push(`(${locationConditions})`);
//       locArr.forEach(loc => values.push(`%${loc}%`));
//     }
    
//     // Add property type filter
//     if (propertyType) {
//       filters.push("LOWER(TRIM(property_type_name)) = ?");
//       values.push(propertyType.toLowerCase());
//     }
    
//     // ✅ NEW: Add status filter helper for Available properties
//     if (status) {
//       const statusLower = status.toLowerCase();
      
//       // Handle different status values
//       switch(statusLower) {
//         case 'available':
//         case 'active':
//         case 'for sale':
//           // Only show public available properties
//           filters.push("(status = 'Available' OR status = 'Active' OR status IS NULL)");
//           filters.push("is_public = 1");
//           filters.push("(is_sold = 0 OR is_sold IS NULL)");
//           break;
//         case 'sold':
//         case 'sold out':
//         case 'inactive':
//           filters.push("(status = 'Sold' OR is_sold = 1)");
//           break;
//         case 'new':
//         case 'new listing':
//           filters.push("is_new_listing = 1");
//           filters.push("is_public = 1");
//           break;
//         default:
//           // For any other status, filter by status and ensure public
//           filters.push("LOWER(TRIM(status)) = ?");
//           values.push(statusLower);
//           filters.push("is_public = 1");
//       }
//     } else {
//       // ✅ DEFAULT: If no status specified, only show public available properties
//       filters.push("is_public = 1");
//       filters.push("(is_sold = 0 OR is_sold IS NULL)");
//       filters.push("(status = 'Available' OR status = 'Active' OR status IS NULL)");
//     }
    
//     // Build WHERE clause
//     const whereClause = filters.length > 0 ? " WHERE " + filters.join(" AND ") : "";
    
//     // Count query
//     const countSql = `SELECT COUNT(*) AS total FROM my_properties${whereClause}`;
    
//     // Execute count query using async/await
//     const [countRows] = await db.query(countSql, values);
//     const total = countRows?.[0]?.total || 0;
    
//     // Data query with sorting
//     const dataSql = `
//       SELECT * FROM my_properties
//       ${whereClause}
//       ORDER BY 
//         is_featured DESC,
//         is_premium DESC, 
//         updated_at DESC, 
//         created_at DESC
//       LIMIT ? OFFSET ?
//     `;
//     const dataValues = [...values, limit, offset];
    
//     // Execute data query using async/await
//     const [dataRows] = await db.query(dataSql, dataValues);
    
//     // Return successful response
//     return res.json({
//       success: true,
//       city: cityInput,
//       locations: locArr.length > 0 ? locArr : null,
//       propertyType: propertyType || null,
//       status: status || 'available',
//       count: dataRows.length,
//       total: total,
//       limit: limit,
//       offset: offset,
//       data: dataRows
//     });
    
//   } catch (error) {
//     console.error("❌ Search properties error:", error);
//     console.error("Stack trace:", error.stack);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error.message
//     });
//   }
// };

// // Public property without docs

// // controllers/property.controller.js

// const PublicgetAllProperties = async (req, res) => {
//   try {
//     const properties = await Property.getAll();

//     // ✅ Remove sensitive fields before sending to frontend
//     const sanitized = properties.map((p) => {
//       const { ownership_doc_path, ownership_doc_name, ...safe } = p;
//       return safe;
//     });

//     res.json({ success: true, data: sanitized });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch properties",
//       error: error.message,
//     });
//   }
// };


// const PublicgetPropertyBySlug = async (req, res) => {
//   try {
//     const slug = req.params.slug;
//     const m = String(slug).match(/^(\d+)(?:-|$)/);
//     if (!m)
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid slug format" });

//     const id = Number(m[1]);
//     const property = await Property.getById(id);
//     if (!property)
//       return res
//         .status(404)
//         .json({ success: false, message: "Property not found" });

//     // ✅ Redirect to canonical slug if different
//     if (property.slug && property.slug !== slug) {
//       const qs = req.url.includes("?")
//         ? req.url.slice(req.url.indexOf("?"))
//         : "";
//       return res.redirect(301, `/buy/projects/page/${property.slug}${qs}`);
//     }

//     // ✅ Capture metadata (analytics)
//     const xff = req.headers["x-forwarded-for"];
//     const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
//     const userAgent = req.get("User-Agent") || null;
//     const referrer = req.get("Referrer") || req.get("Referer") || null;

//     const sessionId = getOrCreateSessionId(req, res);
//     const { token: extractedFilterToken, key: filterParamKey } =
//       extractFilterTokenFromReq(req);

//     try {
//       const safePayload = {
//         query: req.query || {},
//         filterToken: extractedFilterToken,
//         filterParamKey: filterParamKey,
//       };

//       await Property.recordEvent({
//         property_id: id,
//         slug: property.slug || slug,
//         event_type: "view",
//         event_name: "page_view",
//         payload: safePayload,
//         ip,
//         user_agent: userAgent,
//         referrer,
//         session_id: sessionId,
//         filterToken: extractedFilterToken,
//         user_id: req.user?.id ?? null,
//         dedupe_key: sessionId,
//         minutes_window: 1440,
//       });
//     } catch (e) {
//       console.warn("analytics error:", e && e.message);
//     }

//     // ✅ Sanitize sensitive fields before sending to frontend
//     const { ownership_doc_path, ownership_doc_name, ...safeProperty } =
//       property;

//     res.json({ success: true, data: safeProperty });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// };


// // READ (single by id)
// const PublicgetProperty = async (req, res) => {
//   try {
//     const property = await Property.getById(req.params.id);
//     if (!property) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Property not found" });
//     }

//     // Sensitive fields list (same as getAllProperties)
//     const SENSITIVE_KEYS = [
//       "ownership_doc_path",
//       "ownershipDoc",
//       "ownership_document",
//       "internal_notes",
//       "created_by",
//       "updated_by"
//     ];

//     // Hide sensitive fields before sending
//     const copy = { ...property };
//     SENSITIVE_KEYS.forEach((key) => delete copy[key]);

//     return res.json({ success: true, data: copy });
//   } catch (error) {
//     console.error("getProperty error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch property",
//       error: error.message,
//     });
//   }
// };

// importBulk = async (req, res) => {
//   const rows = req.body.rows; // array of objects
//   const results = [];
//   for (const row of rows) {
//     try {
//       await Property.create(row);
//       results.push({ success: true });
//     } catch (err) {
//       results.push({ success: false, error: err.message });
//     }
//   }
//   res.json({
//     success: true,
//     imported: results.filter((r) => r.success).length,
//     failed: results.filter((r) => !r.success).length,
//   });
// };

// const updateAssignedTo = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     if (!id) return res.status(400).json({ success: false, message: "Invalid property id" });

//     const assigned_to = (req.body && "assigned_to" in req.body) ? req.body.assigned_to : undefined;
//     if (assigned_to === undefined) {
//       return res.status(400).json({ success: false, message: "assigned_to required (number|null)" });
//     }

//     const assigned_by = req.user?.id ?? null;
//     const result = await Property.updateAssignedTo(id, assigned_to, assigned_by);

//     if (!result.success) {
//       return res.status(400).json({ success: false, message: result.message || "Failed" });
//     }
//     return res.json({
//       success: true,
//       affected: result.affected,
//       message: result.affected ? "assigned_to updated" : "No rows updated",
//     });
//   } catch (err) {
//     console.error("updateAssignedTo error:", err);
//     return res.status(500).json({ success: false, message: err?.message || "Server error" });
//   }
// };
// // Add this to your controllers/property.controller.js

// /* =========================
//    SIMILAR PROPERTIES
//    ========================= */
// const getSimilarProperties = async (req, res) => {
//   try {
//     const q = req.query || {};

//     // Helpers
//     const normStr = (v) => (v == null ? undefined : String(v).trim());
//     const toInt = (v) => {
//       const n = Number(v);
//       return Number.isFinite(n) ? n : undefined;
//     };
//     const toBool = (v) => {
//       if (typeof v === "boolean") return v;
//       if (v == null) return undefined;
//       const s = String(v).trim().toLowerCase();
//       if (["1", "true", "yes", "y"].includes(s)) return true;
//       if (["0", "false", "no", "n"].includes(s)) return false;
//       return undefined;
//     };
//     const normLocation = (v) =>
//       v == null ? undefined : String(v).replace(/\+/g, " ").trim();

//     // Extract query parameters (new + legacy)
//     const property_id     = toInt(q.property_id);
//     const type            = normStr(q.type);
//     const typeLegacy      = normStr(q.property_type);
//     const subtype         = normStr(q.subtype) || normStr(q.property_subtype);
//     const unit_type       = normStr(q.unit_type) || normStr(q.unitType);
//     const location        = normLocation(q.location);
//     const city            = normStr(q.city);
//     const bedrooms        = toInt(q.bedrooms);
//     const furnishing      = normStr(q.furnishing);
//     const limit           = toInt(q.limit) ?? 6;
//     const exclude_current = toBool(q.exclude_current);

//     // Validation
//     if (!property_id && !city && !location) {
//       return res.status(400).json({
//         success: false,
//         message: "At least one of property_id, city, or location is required",
//       });
//     }

//     // Build filters object
//     const filters = {
//       propertyId: property_id,
//       type: type || typeLegacy,
//       subtype,
//       unitType: unit_type,
//       city,
//       location,
//       bedrooms,
//       furnishing,
//       limit: Math.max(1, limit),
//       excludeCurrent: exclude_current !== undefined ? exclude_current : true,
//     };

//     // Auto-fill from base property if needed
//     if (property_id) {
//       try {
//         const current = await Property.getById(property_id);
//         if (current) {
//           filters.city       = filters.city       || current.city_name;
//           filters.location   = filters.location   || current.location_name;
//           filters.type       = filters.type       || current.property_type_name;
//           filters.subtype    = filters.subtype    || current.property_subtype_name;
//           filters.unitType   = filters.unitType   || current.unit_type;
//           filters.bedrooms   = filters.bedrooms   ?? current.bedrooms;
//           filters.furnishing = filters.furnishing || current.furnishing;
//         }
//       } catch (e) {
//         // Silent fail - no console warning
//       }
//     }

//     const similarProperties = await Property.getSimilarProperties(filters);

//     return res.json({
//       success: true,
//       data: similarProperties,
//       count: Array.isArray(similarProperties) ? similarProperties.length : 0,
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch similar properties",
//     });
//   }
// };


// module.exports = {
//   createProperty,
//   getAllProperties,
//   getProperty,
//   updateProperty,
//   deleteProperty,
//   addPhotosToProperty,
//   deletePhotosFromProperty,
//   getMasterData,
//   migratePropertyData,
//   searchProperties,
//   getPropertyBySlug,
//   recordEventHandler,
//   saveFilterContextHandler,
//   getFilterContextHandler,
//   searchCityLocationsStrict,
//   importBulk,

//   //Public

//   PublicgetAllProperties,
//   PublicgetPropertyBySlug,
//   PublicgetProperty,
//   updateAssignedTo,
//   getSimilarProperties
// };

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
// --- Money parsers: "50L", "1.25Cr", "50,00,000", "5000000" -> number (rupees)
const LAKH = 100_000;
const CRORE = 10_000_000;

function parseMoneyToRupees(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim().toLowerCase();
  const cleaned = raw.replace(/₹/g, "").replace(/\s+/g, "");
  const onlyDigits = cleaned.replace(/,/g, "");

  if (/^\d+(\.\d+)?c(r)?$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/c(r)?/g, ""));
    return Math.round(n * CRORE);
  }
  if (/^\d+(\.\d+)?l$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/l/g, ""));
    return Math.round(n * LAKH);
  }
  if (/^\d+(\.\d+)?$/.test(onlyDigits)) {
    return Math.round(parseFloat(onlyDigits));
  }
  return null;
}

const buildPropertyData = (req, ownershipDocPath, photoPaths) => ({
  seller_name: req.body.seller || null,
  seller_id: req.body.seller_id || null,
  assigned_to: req.body.assigned_to || null,
  property_type_name:
    req.body.propertyType || req.body.property_type_name || null,
  property_subtype_name:
    req.body.propertySubtype || req.body.property_subtype_name || null,
  unit_type: req.body.unitType || req.body.unit_type || null,
  wing: req.body.wing || null,
  unit_no: req.body.unitNo || null,
  furnishing: req.body.furnishing || null,

  // NEW
  bedrooms: req.body.bedrooms != null ? Number(req.body.bedrooms) : null,
  bathrooms: req.body.bathrooms != null ? Number(req.body.bathrooms) : null,
  facing: req.body.facing || null,

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

  // NEW
  price_type: req.body.priceType === "Negotiable" ? "Negotiable" : "Fixed",
  final_price: parseMoneyToRupees(req.body.finalPrice),

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

const createProperty = async (req, res) => {


  // Check if upload directory exists
  const uploadDir = path.join(process.cwd(), "uploads", "properties");
  if (req.files) {
    Object.keys(req.files).forEach((key) => {
      req.files[key].forEach((file) => {
      });
    });
  }

  try {
    // Convert multer file objects to PUBLIC paths (keep your existing toPublic implementation)
    // const ownershipDocPublic = req.files?.ownershipDoc?.[0]
    //   ? toPublic(req.files.ownershipDoc[0])
    //   : null;
    const ownershipDocPublic = req.files?.ownershipDoc?.[0]
      ? req.files.ownershipDoc[0].publicUrl ||
        toPublic(req.files.ownershipDoc[0])
      : null;

    // const photoPublicPaths = (req.files?.photos || []).map(toPublic);
const photoPublicPaths = (req.files?.photos || []).map(
  (f) => f.publicUrl || toPublic(f)
);
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

      bedrooms: req.body.bedrooms != null ? Number(req.body.bedrooms) : null,
      bathrooms: req.body.bathrooms != null ? Number(req.body.bathrooms) : null,
      facing: req.body.facing || null,
      price_type: req.body.priceType === "Negotiable" ? "Negotiable" : "Fixed",
      final_price: parseMoneyToRupees(req.body.finalPrice),

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

    // ✅ Recompute slug if any title/location fields present in request
    const hasAnyTitleField =
      req.body.propertyType || req.body.property_type_name ||
      req.body.unitType || req.body.unit_type ||
      req.body.propertySubtype || req.body.property_subtype_name ||
      req.body.location || req.body.location_name ||
      req.body.city || req.body.city_name;

    if (hasAnyTitleField) {
      try {
        const propertyType   = (req.body.propertyType || req.body.property_type_name || current.property_type_name || "");
        const unitType       = (req.body.unitType || req.body.unit_type || current.unit_type || "");
        const propertySubtype= (req.body.propertySubtype || req.body.property_subtype_name || current.property_subtype_name || "");
        const locationName   = (req.body.location || current.location_name || "");
        const cityName       = (req.body.city || req.body.city_name || current.city_name || "");

        const newSlug = slugifyTextParts(
          id,
          propertyType,
          unitType,
          propertySubtype,
          locationName,
          cityName
        );

        if (newSlug && newSlug !== current.slug) {
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


const searchProperties = (req, res) => {
  try {
    let {
      city,
      location,
      locations,
      budget_min,
      budget_max,
      sort,
      propertyType,
      propertySubtype,
      unitTypes,
      unitType,
      furnishing,
      verified,
      parking,
      floor_min,
      floor_max,
      bathrooms,
      bedrooms,
      status,  // Map this to actual boolean columns
      is_public,
      isPublic,
      visibility,
      publicOnly,
    } = req.query;

    const PRICE_COL = 'budget';

    const toNumOrNull = (v) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const normalizePropertyType = (s) => {
      if (!s) return s;
      const t = String(s).trim().toLowerCase();
      if (/^residential/.test(t)) return 'Residential';
      if (/^commercial/.test(t))  return 'Commercial';
      if (/agri|agric|farm|land/.test(t)) return 'Agriculture Land';
      return s.toString().trim();
    };

    const minP = toNumOrNull(budget_min);
    const maxP = toNumOrNull(budget_max);

    const filters = [];
    const values = [];

    // city_name (partial, case-insensitive)
    if (city) {
      filters.push('LOWER(city_name) LIKE ?');
      values.push(`%${String(city).toLowerCase()}%`);
    }

    // location_name (CSV/array; OR of LIKEs)
    const locInput = (location !== undefined ? location : locations);
    if (locInput) {
      let locArr = [];
      if (Array.isArray(locInput)) {
        locArr = locInput.map((s) => String(s).trim()).filter(Boolean);
      } else {
        locArr = String(locInput).split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (locArr.length === 1) {
        filters.push('LOWER(location_name) LIKE ?');
        values.push(`%${locArr[0].toLowerCase()}%`);
      } else if (locArr.length > 1) {
        const likePlaceholders = locArr.map(() => 'LOWER(location_name) LIKE ?').join(' OR ');
        filters.push(`(${likePlaceholders})`);
        locArr.forEach((l) => values.push(`%${l.toLowerCase()}%`));
      }
    }

    // budget range
    if (minP !== null) { filters.push(`${PRICE_COL} >= ?`); values.push(minP); }
    if (maxP !== null) { filters.push(`${PRICE_COL} <= ?`); values.push(maxP); }

    // property_type_name
    if (propertyType) {
      const arr = String(propertyType)
        .split(',')
        .map((s) => normalizePropertyType(s))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (arr.length === 1) { filters.push('LOWER(property_type_name) = ?'); values.push(arr[0]); }
      else if (arr.length > 1) { filters.push(`LOWER(property_type_name) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
    }

    // property_subtype_name
    if (propertySubtype) {
      const arr = String(propertySubtype).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (arr.length === 1) { filters.push('LOWER(property_subtype_name) = ?'); values.push(arr[0]); }
      else if (arr.length > 1) { filters.push(`LOWER(property_subtype_name) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
    }

    // unit_type (supports unitType or unitTypes)
    const unitInput = unitType || unitTypes;
    if (unitInput) {
      const arr = String(unitInput).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (arr.length === 1) { filters.push('LOWER(unit_type) = ?'); values.push(arr[0]); }
      else if (arr.length > 1) { filters.push(`LOWER(unit_type) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
    }

    // furnishing
    if (furnishing) {
      filters.push('LOWER(furnishing) = ?');
      values.push(String(furnishing).toLowerCase());
    }

    // verified
    if (verified !== undefined) {
      filters.push('is_verified = ?');
      values.push(String(verified) === '1' || verified === true ? 1 : 0);
    }

    // ✅ FIX: Handle is_public filter (supports multiple param names)
    const publicParam = is_public || isPublic || visibility || publicOnly;
    if (publicParam !== undefined) {
      // Handle various formats: true, "true", "1", 1, "public"
      const isPublicValue = 
        publicParam === true || 
        publicParam === 1 || 
        String(publicParam).toLowerCase() === 'true' || 
        String(publicParam) === '1' || 
        String(publicParam).toLowerCase() === 'public';
      
      filters.push('is_public = ?');
      values.push(isPublicValue ? 1 : 0);
    }

    // ✅ FIX: Map "status" to actual boolean columns
    if (status) {
      const statusLower = String(status).toLowerCase();
      switch(statusLower) {
        case 'available':
          filters.push('is_available = 1');
          filters.push('is_sold = 0');
          break;
        case 'sold':
          filters.push('is_sold = 1');
          break;
        case 'new':
        case 'new listing':
          filters.push('is_new_listing = 1');
          break;
        case 'premium':
          filters.push('is_premium = 1');
          break;
        case 'featured':
          filters.push('is_featured = 1');
          break;
        default:
          // If status doesn't match any known value, ignore it
          console.warn(`Unknown status value: ${status}`);
      }
    }

    // parking (parking_type / parking_qty)
    if (parking) {
      const p = String(parking).toLowerCase();
      if (p === 'any') {
        filters.push('(parking_qty IS NOT NULL AND parking_qty > 0)');
      } else if (p === '2w' || p.includes('2')) {
        filters.push("(LOWER(parking_type) LIKE '%2w%' OR LOWER(parking_type) LIKE '%two%')");
      } else if (p === '4w' || p.includes('4')) {
        filters.push("(LOWER(parking_type) LIKE '%4w%' OR LOWER(parking_type) LIKE '%four%' OR LOWER(parking_type) LIKE '%car%')");
      } else {
        const pn = toNumOrNull(parking);
        if (pn !== null) {
          filters.push('parking_qty >= ?');
          values.push(pn);
        }
      }
    }

    // floor range
    const floorMin = toNumOrNull(floor_min);
    const floorMax = toNumOrNull(floor_max);
    if (floorMin !== null) { filters.push('floor >= ?'); values.push(floorMin); }
    if (floorMax !== null) { filters.push('floor <= ?'); values.push(floorMax); }

    // bathrooms / bedrooms
    const baths = toNumOrNull(bathrooms);
    if (baths !== null) { filters.push('bathrooms >= ?'); values.push(baths); }

    if (bedrooms) {
      const arr = String(bedrooms).split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length === 1) {
        const b = toNumOrNull(arr[0]);
        if (b !== null) { filters.push('bedrooms = ?'); values.push(b); }
      } else if (arr.length > 1) {
        const nums = arr.map((n) => toNumOrNull(n)).filter((n) => n !== null);
        if (nums.length) { filters.push(`bedrooms IN (${nums.map(() => '?').join(',')})`); values.push(...nums); }
      }
    }

    const whereClause = filters.length ? ' WHERE ' + filters.join(' AND ') : '';

    const SELECT_COLUMNS = `
      id,
      seller_name, seller_id, lead_id, assigned_to,
      property_type_name, property_subtype_name, unit_type, wing, unit_no,
      furnishing, bedrooms, bathrooms, facing, parking_type, parking_qty,
      city_name, location_name, society_name, floor, total_floors,
      carpet_area, builtup_area,
      budget, price_type, final_price,
      address, status, lead_source,
      possession_month, possession_year, purchase_month, purchase_year,
      selling_rights, ownership_doc_path,
      photos, amenities, furnishing_items, nearby_places, description,
      created_at, updated_at,
      is_public, is_private, is_sold, is_available, is_new_listing, is_premium, is_verified, is_featured,
      publication_date, created_by, updated_by,
      public_views, public_inquiries,
      slug
    `.replace(/\s+/g, ' ').trim();

    let sql = `SELECT ${SELECT_COLUMNS} FROM my_properties${whereClause}`;
    let finalValues = [...values];

    // sorting
    if (sort) {
      switch (sort) {
        case 'low_to_high':
          sql += ` ORDER BY ${PRICE_COL} ASC`;
          break;
        case 'high_to_low':
          sql += ` ORDER BY ${PRICE_COL} DESC`;
          break;
        case 'medium': {
          if (whereClause) {
            sql = `
              SELECT ${SELECT_COLUMNS} FROM my_properties
              ${whereClause}
              ORDER BY ABS(${PRICE_COL} - (
                SELECT AVG(${PRICE_COL}) FROM my_properties ${whereClause}
              )) ASC
            `;
            finalValues = [...values, ...values];
          } else {
            sql = `
              SELECT ${SELECT_COLUMNS} FROM my_properties
              ORDER BY ABS(${PRICE_COL} - (SELECT AVG(${PRICE_COL}) FROM my_properties)) ASC
            `;
            finalValues = [];
          }
          break;
        }
        case 'newest':
          sql += ' ORDER BY created_at DESC';
          break;
        default:
          sql += ` ORDER BY ${PRICE_COL} ASC`;
      }
    } else {
      sql += ` ORDER BY ${PRICE_COL} ASC`;
    }

    // 🔍 Debug logging
    console.log('SQL Query:', sql);
    console.log('Values:', finalValues);

    db.query(sql, finalValues, (err, results) => {
      if (err) {
        console.error('DB error:', err, { sql, finalValues });
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, data: results, count: results.length });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
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
      return res.redirect(301, `/properties/${property.slug}${qs}`);
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
// POST /api/properties/search/city-locations
// const searchCityLocationsStrict = async (req, res) => {
//   try {
   
//     // Get city from query parameters
//     const cityInput = (req.query.city || req.query.city_name || "").toString().trim();
  
//     // Validate city is provided
//     if (!cityInput) {
     
//       return res.status(400).json({
//         success: false,
//         message: "City parameter is required"
//       });
//     }
    
//     // Get locations from query parameters
//     let locationsInput = req.query.locations || req.query.location_name || "";
    
//     // Process locations input
//     let locArr = [];
//     if (locationsInput) {
     
//       if (typeof locationsInput === "string") {
//         locArr = locationsInput.split(",").map(s => s.trim()).filter(Boolean);
//       } else if (Array.isArray(locationsInput)) {
//         locArr = locationsInput.map(s => String(s).trim()).filter(Boolean);
//       }
      
//       // Normalize: lowercase, remove duplicates, limit to 5 locations
//       locArr = Array.from(new Set(locArr.map(s => s.toLowerCase()))).slice(0, 5);
//     }
    
  
//     // Pagination parameters
//     const limit = Math.min(Number(req.query.limit) || 50, 200);
//     const offset = Number(req.query.offset) || 0;
    
   
//     // Build SQL query
//     const filters = [];
//     const values = [];
    
//     // Add city filter (case-insensitive exact match)
//     filters.push("LOWER(TRIM(city_name)) = ?");
//     values.push(cityInput.toLowerCase());
   
//     // Add location filter if locations provided
//     if (locArr.length > 0) {
//       const locationConditions = locArr.map(() => "LOWER(TRIM(location_name)) LIKE ?").join(" OR ");
//       filters.push(`(${locationConditions})`);
//       locArr.forEach(loc => values.push(`%${loc}%`));
     
//     }
    
//     // Build WHERE clause
//     const whereClause = filters.length > 0 ? " WHERE " + filters.join(" AND ") : "";
    
  
//     // Count query
//     const countSql = `SELECT COUNT(*) AS total FROM my_properties${whereClause}`;
   
//     // Execute count query using async/await
//     const [countRows] = await db.query(countSql, values);

//     const total = countRows?.[0]?.total || 0;
    
//     // Data query with sorting
//     const dataSql = `
//       SELECT * FROM my_properties
//       ${whereClause}
//       ORDER BY updated_at DESC, created_at DESC
//       LIMIT ? OFFSET ?
//     `;
//     const dataValues = [...values, limit, offset];
    
//     // Execute data query using async/await
//     const [dataRows] = await db.query(dataSql, dataValues);
    
//     // Return successful response
//     return res.json({
//       success: true,
//       city: cityInput,
//       locations: locArr.length > 0 ? locArr : null,
//       count: dataRows.length,
//       total: total,
//       limit: limit,
//       offset: offset,
//       data: dataRows
//     });
    
//   } catch (error) {
//     console.error("❌ Search properties error:", error);
//     console.error("Stack trace:", error.stack);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error.message
//     });
//   }
// };

const searchCityLocationsStrict = async (req, res) => {
  try {
    // Get city from query parameters
    const cityInput = (req.query.city || req.query.city_name || "").toString().trim();
    
    // Validate city is provided
    if (!cityInput) {
      return res.status(400).json({
        success: false,
        message: "City parameter is required"
      });
    }
    
    // Get locations from query parameters
    let locationsInput = req.query.locations || req.query.location_name || "";
    
    // Process locations input
    let locArr = [];
    if (locationsInput) {
      if (typeof locationsInput === "string") {
        locArr = locationsInput.split(",").map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(locationsInput)) {
        locArr = locationsInput.map(s => String(s).trim()).filter(Boolean);
      }
      
      // Normalize: lowercase, remove duplicates, limit to 5 locations
      locArr = Array.from(new Set(locArr.map(s => s.toLowerCase()))).slice(0, 5);
    }
    
    // Get other filters
    const propertyType = (req.query.propertyType || req.query.property_type || "").toString().trim();
    const status = (req.query.status || "").toString().trim();
    
    // Pagination parameters
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    
    // Build SQL query
    const filters = [];
    const values = [];
    
    // Add city filter (case-insensitive exact match)
    filters.push("LOWER(TRIM(city_name)) = ?");
    values.push(cityInput.toLowerCase());
    
    // Add location filter if locations provided
    if (locArr.length > 0) {
      const locationConditions = locArr.map(() => "LOWER(TRIM(location_name)) LIKE ?").join(" OR ");
      filters.push(`(${locationConditions})`);
      locArr.forEach(loc => values.push(`%${loc}%`));
    }
    
    // Add property type filter
    if (propertyType) {
      filters.push("LOWER(TRIM(property_type_name)) = ?");
      values.push(propertyType.toLowerCase());
    }
    
    // ✅ NEW: Add status filter helper for Available properties
    if (status) {
      const statusLower = status.toLowerCase();
      
      // Handle different status values
      switch(statusLower) {
        case 'available':
        case 'active':
        case 'for sale':
          // Only show public available properties
          filters.push("(status = 'Available' OR status = 'Active' OR status IS NULL)");
          filters.push("is_public = 1");
          filters.push("(is_sold = 0 OR is_sold IS NULL)");
          break;
        case 'sold':
        case 'sold out':
        case 'inactive':
          filters.push("(status = 'Sold' OR is_sold = 1)");
          break;
        case 'new':
        case 'new listing':
          filters.push("is_new_listing = 1");
          filters.push("is_public = 1");
          break;
        default:
          // For any other status, filter by status and ensure public
          filters.push("LOWER(TRIM(status)) = ?");
          values.push(statusLower);
          filters.push("is_public = 1");
      }
    } else {
      // ✅ DEFAULT: If no status specified, only show public available properties
      filters.push("is_public = 1");
      filters.push("(is_sold = 0 OR is_sold IS NULL)");
      filters.push("(status = 'Available' OR status = 'Active' OR status IS NULL)");
    }
    
    // Build WHERE clause
    const whereClause = filters.length > 0 ? " WHERE " + filters.join(" AND ") : "";
    
    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM my_properties${whereClause}`;
    
    // Execute count query using async/await
    const [countRows] = await db.query(countSql, values);
    const total = countRows?.[0]?.total || 0;
    
    // Data query with sorting
    const dataSql = `
      SELECT * FROM my_properties
      ${whereClause}
      ORDER BY 
        is_featured DESC,
        is_premium DESC, 
        updated_at DESC, 
        created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataValues = [...values, limit, offset];
    
    // Execute data query using async/await
    const [dataRows] = await db.query(dataSql, dataValues);
    
    // Return successful response
    return res.json({
      success: true,
      city: cityInput,
      locations: locArr.length > 0 ? locArr : null,
      propertyType: propertyType || null,
      status: status || 'available',
      count: dataRows.length,
      total: total,
      limit: limit,
      offset: offset,
      data: dataRows
    });
    
  } catch (error) {
    console.error("❌ Search properties error:", error);
    console.error("Stack trace:", error.stack);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Public property without docs

// controllers/property.controller.js

const PublicgetAllProperties = async (req, res) => {
  try {
    const properties = await Property.getAll();

    // ✅ Remove sensitive fields before sending to frontend
    const sanitized = properties.map((p) => {
      const { ownership_doc_path, ownership_doc_name, ...safe } = p;
      return safe;
    });

    res.json({ success: true, data: sanitized });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch properties",
      error: error.message,
    });
  }
};


const PublicgetPropertyBySlug = async (req, res) => {
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

    // ✅ Redirect to canonical slug if different
    if (property.slug && property.slug !== slug) {
      const qs = req.url.includes("?")
        ? req.url.slice(req.url.indexOf("?"))
        : "";
      return res.redirect(301, `/properties/${property.slug}${qs}`);
    }

    // ✅ Capture metadata (analytics)
    const xff = req.headers["x-forwarded-for"];
    const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
    const userAgent = req.get("User-Agent") || null;
    const referrer = req.get("Referrer") || req.get("Referer") || null;

    const sessionId = getOrCreateSessionId(req, res);
    const { token: extractedFilterToken, key: filterParamKey } =
      extractFilterTokenFromReq(req);

    try {
      const safePayload = {
        query: req.query || {},
        filterToken: extractedFilterToken,
        filterParamKey: filterParamKey,
      };

      await Property.recordEvent({
        property_id: id,
        slug: property.slug || slug,
        event_type: "view",
        event_name: "page_view",
        payload: safePayload,
        ip,
        user_agent: userAgent,
        referrer,
        session_id: sessionId,
        filterToken: extractedFilterToken,
        user_id: req.user?.id ?? null,
        dedupe_key: sessionId,
        minutes_window: 1440,
      });
    } catch (e) {
      console.warn("analytics error:", e && e.message);
    }

    // ✅ Sanitize sensitive fields before sending to frontend
    const { ownership_doc_path, ownership_doc_name, ...safeProperty } =
      property;

    res.json({ success: true, data: safeProperty });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


// READ (single by id)
const PublicgetProperty = async (req, res) => {
  try {
    const property = await Property.getById(req.params.id);
    if (!property) {
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });
    }

    // Sensitive fields list (same as getAllProperties)
    const SENSITIVE_KEYS = [
      "ownership_doc_path",
      "ownershipDoc",
      "ownership_document",
      "internal_notes",
      "created_by",
      "updated_by"
    ];

    // Hide sensitive fields before sending
    const copy = { ...property };
    SENSITIVE_KEYS.forEach((key) => delete copy[key]);

    return res.json({ success: true, data: copy });
  } catch (error) {
    console.error("getProperty error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch property",
      error: error.message,
    });
  }
};

const importBulk = async (req, res) => {
  const rows = req.body.rows; // array of objects
  const results = [];
  for (const row of rows) {
    try {
      await Property.create(row);
      results.push({ success: true });
    } catch (err) {
      results.push({ success: false, error: err.message });
    }
  }
  res.json({
    success: true,
    imported: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
};

const updateAssignedTo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid property id" });

    const assigned_to = (req.body && "assigned_to" in req.body) ? req.body.assigned_to : undefined;
    if (assigned_to === undefined) {
      return res.status(400).json({ success: false, message: "assigned_to required (number|null)" });
    }

    const assigned_by = req.user?.id ?? null;
    const result = await Property.updateAssignedTo(id, assigned_to, assigned_by);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message || "Failed" });
    }
    return res.json({
      success: true,
      affected: result.affected,
      message: result.affected ? "assigned_to updated" : "No rows updated",
    });
  } catch (err) {
    console.error("updateAssignedTo error:", err);
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};
// Add this to your controllers/property.controller.js

/* =========================
   SIMILAR PROPERTIES
   ========================= */
const getSimilarProperties = async (req, res) => {
  try {
    const q = req.query || {};

    // Helpers
    const normStr = (v) => (v == null ? undefined : String(v).trim());
    const toInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const toBool = (v) => {
      if (typeof v === "boolean") return v;
      if (v == null) return undefined;
      const s = String(v).trim().toLowerCase();
      if (["1", "true", "yes", "y"].includes(s)) return true;
      if (["0", "false", "no", "n"].includes(s)) return false;
      return undefined;
    };
    const normLocation = (v) =>
      v == null ? undefined : String(v).replace(/\+/g, " ").trim();

    // Extract query parameters (new + legacy)
    const property_id     = toInt(q.property_id);
    const type            = normStr(q.type);
    const typeLegacy      = normStr(q.property_type);
    const subtype         = normStr(q.subtype) || normStr(q.property_subtype);
    const unit_type       = normStr(q.unit_type) || normStr(q.unitType);
    const location        = normLocation(q.location);
    const city            = normStr(q.city);
    const bedrooms        = toInt(q.bedrooms);
    const furnishing      = normStr(q.furnishing);
    const limit           = toInt(q.limit) ?? 6;
    const exclude_current = toBool(q.exclude_current);

    // Validation
    if (!property_id && !city && !location) {
      return res.status(400).json({
        success: false,
        message: "At least one of property_id, city, or location is required",
      });
    }

    // Build filters object
    const filters = {
      propertyId: property_id,
      type: type || typeLegacy,
      subtype,
      unitType: unit_type,
      city,
      location,
      bedrooms,
      furnishing,
      limit: Math.max(1, limit),
      excludeCurrent: exclude_current !== undefined ? exclude_current : true,
    };

    // Auto-fill from base property if needed
    if (property_id) {
      try {
        const current = await Property.getById(property_id);
        if (current) {
          filters.city       = filters.city       || current.city_name;
          filters.location   = filters.location   || current.location_name;
          filters.type       = filters.type       || current.property_type_name;
          filters.subtype    = filters.subtype    || current.property_subtype_name;
          filters.unitType   = filters.unitType   || current.unit_type;
          filters.bedrooms   = filters.bedrooms   ?? current.bedrooms;
          filters.furnishing = filters.furnishing || current.furnishing;
        }
      } catch (e) {
        // Silent fail - no console warning
      }
    }

    const similarProperties = await Property.getSimilarProperties(filters);

    return res.json({
      success: true,
      data: similarProperties,
      count: Array.isArray(similarProperties) ? similarProperties.length : 0,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch similar properties",
    });
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
  searchCityLocationsStrict,
  importBulk,

  //Public

  PublicgetAllProperties,
  PublicgetPropertyBySlug,
  PublicgetProperty,
  updateAssignedTo,
  getSimilarProperties
};
