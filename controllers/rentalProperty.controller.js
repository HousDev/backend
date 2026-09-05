// controllers/rentalProperty.controller.js
const RentalProperty = require("../models/RentalProperty");
const Property = require("../models/Property");
const MasterData = require("../models/masterModel");
const path = require("path");
const fs = require("fs");
const { slugifyTextParts } = require("../utils/slugify");
const db = require("../config/database");
const { publicFileUrl, fileRelPathFromUpload } = require("../utils/url");
const Views = require("../models/views.model");
const { getOrCreateSessionId } = require('../utils/sessionUtils');
const { syncSocietyPhotoLabels } = require("../utils/societySync");
const { geocodeAddress } = require("../utils/geocoder");

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

const LAKH = 100_000;
const CRORE = 10_000_000;

function parseMoneyToRupees(value) {
  if (value == null || value === "") return null;

  const raw = String(value).trim().toLowerCase();
  const cleaned = raw.replace(/₹/g, "").replace(/\s+/g, "");
  const onlyDigits = cleaned.replace(/,/g, "");

  if (/^\d+(\.\d+)?c(r)?$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/c(r)?/g, ""));
    return Math.trunc(n * CRORE);
  }

  if (/^\d+(\.\d+)?l$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/l/g, ""));
    return Math.trunc(n * LAKH);
  }

  if (/^\d+(\.\d+)?$/.test(onlyDigits)) {
    return Math.trunc(parseFloat(onlyDigits));
  }

  return null;
}

const parsePhotoLabels = (req) => {
  if (!req.body.photoLabels) return [];
  try {
    const parsed = typeof req.body.photoLabels === 'string'
      ? JSON.parse(req.body.photoLabels)
      : req.body.photoLabels;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parsePhotoTypes = (req) => {
  if (!req.body.photoTypes) return [];
  try {
    const parsed = typeof req.body.photoTypes === 'string'
      ? JSON.parse(req.body.photoTypes)
      : req.body.photoTypes;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildPropertyData = (req, ownershipDocPath, photoPaths) => ({
  owner_name: req.body.owner_name || req.body.owner || req.body.seller_name || req.body.seller || null,
  owner_id: req.body.owner_id || req.body.seller_id || null,
  assigned_to: req.body.assigned_to || null,
  property_type_name: req.body.propertyType || req.body.property_type_name || null,
  property_subtype_name: req.body.propertySubtype || req.body.property_subtype_name || null,
  unit_type: req.body.unitType || req.body.unit_type || null,
  wing: req.body.wing || null,
  unit_no: req.body.unitNo || null,
  furnishing: req.body.furnishing || null,

  bedrooms: req.body.bedrooms != null ? Number(req.body.bedrooms) : null,
  bathrooms: req.body.bathrooms != null ? Number(req.body.bathrooms) : null,
  balcony: req.body.balcony || null ? Number(req.body.balcony) : null,
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

  address: req.body.address || null,
  status: req.body.status || null,
  lead_source: req.body.leadSource || req.body.lead_source || null,
  source_url: req.body.source_url || req.body.sourceUrl || null,
  photos: photoPaths,
  amenities: parseArrayField(req.body.amenities),
  furnishing_items: parseArrayField(req.body.furnishingItems || req.body.furnishing_items),
  nearby_places: parseNearbyPlaces(req),
  description: req.body.description || null,

  // Rent Fields
  listing_type: req.body.listing_type || 'rent',
  monthly_rent: req.body.monthly_rent || null,
  security_deposit: req.body.security_deposit || null,
  maintenance_extra: req.body.maintenance_extra === 'true' || req.body.maintenance_extra === true || req.body.maintenance_extra === 1 || req.body.maintenance_extra === '1' ? 1 : 0,
  maintenance_charge: req.body.maintenance_charge || null,
  preferred_tenants: (() => {
    const val = req.body.preferred_tenants;
    if (!val) return null;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.join(', ');
      } catch (e) {}
      return val;
    }
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  })(),
  lock_in_period: req.body.lock_in_period ? Number(req.body.lock_in_period) : null,
  notice_period: req.body.notice_period || null,
  agreement_duration: req.body.agreement_duration ? Number(req.body.agreement_duration) : null,
  available_from: req.body.available_from || null,
});

const toPublic = (f) =>
  "/uploads/properties/" +
  (f.filename || path.basename(f.path)).replace(/\\/g, "/");

function extractFilterTokenFromReq(req) {
  const q = req.query || {};
  if (q.filterToken) return { token: String(q.filterToken), key: "filterToken" };
  if (q.fltcnt) return { token: String(q.fltcnt), key: "fltcnt" };
  if (q.filter_token) return { token: String(q.filter_token), key: "filter_token" };

  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  for (const k of Object.keys(q)) {
    const v = q[k];
    if (!v) continue;
    if (typeof v === "string" && uuidRegex.test(v)) return { token: v, key: k };
    if (typeof v === "string" && v.length >= 20) return { token: v, key: k };
  }

  const b = req.body || {};
  if (b.filterToken) return { token: String(b.filterToken), key: "filterToken" };
  if (b.fltcnt) return { token: String(b.fltcnt), key: "fltcnt" };
  if (b.filter_token) return { token: String(b.filter_token), key: "filter_token" };

  return { token: null, key: null };
}

// ---------------------
// Controller Functions

const createProperty = async (req, res) => {
  try {
    let existingPhotoUrls = [];
    if (req.body.existingPhotoUrls) {
      try {
        if (typeof req.body.existingPhotoUrls === 'string') {
          existingPhotoUrls = JSON.parse(req.body.existingPhotoUrls);
        } else if (Array.isArray(req.body.existingPhotoUrls)) {
          existingPhotoUrls = req.body.existingPhotoUrls;
        }
      } catch (e) {
        existingPhotoUrls = [];
      }
    }

    const ownershipDocPublic = req.files?.ownershipDoc?.[0]
      ? req.files.ownershipDoc[0].publicUrl || toPublic(req.files.ownershipDoc[0])
      : null;

    const newPhotoPublicPaths = (req.files?.photos || []).map(
      (f) => f.publicUrl || toPublic(f)
    );
    const photoLabels = parsePhotoLabels(req);
    const photoTypes = parsePhotoTypes(req);

    const normalizedExisting = existingPhotoUrls.map((p) =>
      typeof p === 'string' ? { url: p, label: '', isSociety: true, type: 'image' } : { type: 'image', ...p }
    );
    const normalizedNew = newPhotoPublicPaths.map((url, idx) => ({
      url,
      label: photoLabels[idx] || '',
      isSociety: false,
      type: photoTypes[idx] === 'video' ? 'video' : 'image',
    }));

    let allPhotoPaths;
    try {
      const rawOrder = req.body.photoOrder;
      const photoOrder = rawOrder
        ? (typeof rawOrder === 'string' ? JSON.parse(rawOrder) : rawOrder)
        : [];

      if (
        Array.isArray(photoOrder) &&
        photoOrder.length === normalizedExisting.length + normalizedNew.length
      ) {
        const existingByUrl = new Map(normalizedExisting.map((e) => [e.url, e]));
        let newIdx = 0;
        allPhotoPaths = photoOrder
          .map((entry) => {
            if (entry.kind === 'existing') {
              return existingByUrl.get(entry.url) || null;
            }
            const item = normalizedNew[newIdx];
            newIdx += 1;
            return item || null;
          })
          .filter(Boolean);
      } else {
        allPhotoPaths = [...normalizedExisting, ...normalizedNew];
      }
    } catch (e) {
      allPhotoPaths = [...normalizedExisting, ...normalizedNew];
    }

    const propertyData = buildPropertyData(req, ownershipDocPublic, allPhotoPaths);

    if (!propertyData.owner_id && propertyData.owner_name) {
      try {
        const cleanName = propertyData.owner_name.replace(/^(Mr\.?|Mrs\.?|Ms\.?|Miss\.?|Dr\.?)\s+/i, '').trim();
        const [foundOwners] = await db.query(
          `SELECT id, name FROM owners WHERE name = ? OR name LIKE ? LIMIT 1`,
          [propertyData.owner_name, `%${cleanName}%`]
        );
        if (foundOwners && foundOwners.length > 0) {
          propertyData.owner_id = foundOwners[0].id;
        }
      } catch (err) {
        console.warn("Could not lookup owner_id by owner_name:", err);
      }
    }

    // Auto-resolve latitude and longitude coordinates
    let latitude = null;
    let longitude = null;
    const socId = propertyData.society_id || req.body.society_id || req.body.society;
    if (socId) {
      try {
        const [socRows] = await db.query(
          "SELECT latitude, longitude FROM societies WHERE id = ? OR society_name = ? LIMIT 1",
          [socId, socId]
        );
        if (socRows[0] && socRows[0].latitude && socRows[0].longitude) {
          latitude = parseFloat(socRows[0].latitude);
          longitude = parseFloat(socRows[0].longitude);
        }
      } catch (err) {
        console.warn("Could not inherit coordinates from society:", err);
      }
    }
    if ((!latitude || !longitude) && (propertyData.location_name || propertyData.address)) {
      const addr = `${propertyData.location_name || propertyData.address || ""}, ${propertyData.city_name || "Pune"}, Maharashtra`;
      const coords = await geocodeAddress(addr);
      if (coords) {
        latitude = coords.latitude;
        longitude = coords.longitude;
      }
    }
    propertyData.latitude = latitude;
    propertyData.longitude = longitude;

    const propertyId = await RentalProperty.create(propertyData);

    // Sync society photo labels back to the master society record
    if (req.body.society) {
      await syncSocietyPhotoLabels(req.body.society, allPhotoPaths);
    } else if (req.body.society_name) {
      await syncSocietyPhotoLabels(req.body.society_name, allPhotoPaths);
    }

    const propertyType = propertyData.property_type_name || "";
    const unitType = propertyData.unit_type || "";
    const propertySubtype = propertyData.property_subtype_name || "";
    const locationName = propertyData.location_name || "";
    const cityName = propertyData.city_name || "";

    const titlePart = slugifyTextParts(
      propertyId,
      propertyType,
      unitType,
      propertySubtype,
      locationName,
      cityName
    );

    const slug = titlePart;

    try {
      await RentalProperty.updateSlug(propertyId, slug);
    } catch (slugErr) {
      console.warn("Failed to update slug:", slugErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Rental property created successfully",
      data: {
        id: propertyId,
        slug,
        url: `/properties/${slug}`,
        photos: allPhotoPaths,
        uploadedFiles: {
          ownershipDoc: ownershipDocPublic ? 1 : 0,
          photos: newPhotoPublicPaths.length,
          existingPhotos: existingPhotoUrls.length,
        },
      },
    });
  } catch (error) {
    console.error("Create failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create rental property",
      error: error.message,
    });
  }
};

const getAllProperties = async (req, res) => {
  try {
    const properties = await RentalProperty.getAll();
    res.json({ success: true, data: properties });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch rental properties",
      error: error.message,
    });
  }
};

const getProperty = async (req, res) => {
  try {
    const property = await RentalProperty.getById(req.params.id);
    if (!property)
      return res.status(404).json({ success: false, message: "Rental property not found" });

    if (typeof property.photos === 'string') {
      try {
        property.photos = JSON.parse(property.photos);
      } catch { property.photos = []; }
    }
    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch rental property",
      error: error.message,
    });
  }
};

const updateProperty = async (req, res) => {
  try {
    const id = req.params.id;
    const current = await RentalProperty.getById(id);
    if (!current) {
      return res.status(404).json({ success: false, message: "Rental property not found" });
    }

    let existingFromBody = [];
    if (req.body.existingPhotoUrls) {
      try {
        if (typeof req.body.existingPhotoUrls === 'string') {
          existingFromBody = JSON.parse(req.body.existingPhotoUrls);
        } else if (Array.isArray(req.body.existingPhotoUrls)) {
          existingFromBody = req.body.existingPhotoUrls;
        }
      } catch (e) {
        existingFromBody = [];
      }
    }

    const uploadedPhotoPublic = (req.files?.photos || []).map(
      (f) => f.publicUrl || toPublic(f)
    );
    const photoLabels = parsePhotoLabels(req);
    const photoTypes = parsePhotoTypes(req);

    const normalizedExisting = existingFromBody.map((p) =>
      typeof p === 'string' ? { url: p, label: '', isSociety: true, type: 'image' } : { type: 'image', ...p }
    );
    const normalizedNew = uploadedPhotoPublic.map((url, idx) => ({
      url,
      label: photoLabels[idx] || '',
      isSociety: false,
      type: photoTypes[idx] === 'video' ? 'video' : 'image',
    }));

    let finalPhotos;
    try {
      const rawOrder = req.body.photoOrder;
      const photoOrder = rawOrder
        ? (typeof rawOrder === 'string' ? JSON.parse(rawOrder) : rawOrder)
        : [];

      if (
        Array.isArray(photoOrder) &&
        photoOrder.length === normalizedExisting.length + normalizedNew.length
      ) {
        const existingByUrl = new Map(normalizedExisting.map((e) => [e.url, e]));
        let newIdx = 0;
        finalPhotos = photoOrder
          .map((entry) => {
            if (entry.kind === 'existing') {
              return existingByUrl.get(entry.url) || null;
            }
            const item = normalizedNew[newIdx];
            newIdx += 1;
            return item || null;
          })
          .filter(Boolean);
      } else {
        finalPhotos = [...normalizedExisting, ...normalizedNew];
      }
    } catch (e) {
      finalPhotos = [...normalizedExisting, ...normalizedNew];
    }

    const uploadedDocPublic = req.files?.ownershipDoc?.[0]
      ? req.files.ownershipDoc[0].publicUrl || toPublic(req.files.ownershipDoc[0])
      : null;

    const existingDocFromBody = req.body.existingOwnershipDocUrl || req.body.existingOwnershipDoc || null;
    const finalOwnershipDoc = uploadedDocPublic !== null
        ? uploadedDocPublic
        : existingDocFromBody !== null
        ? existingDocFromBody
        : current.ownership_doc_path || null;

    const propertyData = {
      owner_name: req.body.owner_name || req.body.owner || req.body.seller_name || req.body.seller || null,
      owner_id: req.body.owner_id || req.body.seller_id || null,
      property_type_name: req.body.propertyType || req.body.property_type_name || null,
      property_subtype_name: req.body.propertySubtype || req.body.property_subtype_name || null,
      unit_type: req.body.unitType || req.body.unit_type || null,
      wing: req.body.wing || null,
      unit_no: req.body.unitNo || null,
      furnishing: req.body.furnishing || null,

      bedrooms: req.body.bedrooms != null ? Number(req.body.bedrooms) : null,
      bathrooms: req.body.bathrooms != null ? Number(req.body.bathrooms) : null,
      balcony: req.body.balcony || null ? Number(req.body.balcony) : null,
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
      lead_source: req.body.leadSource || req.body.lead_source || "website",
      source_url: req.body.source_url || req.body.sourceUrl || null,

      ownership_doc_path: finalOwnershipDoc,
      photos: finalPhotos,

      amenities: parseArrayField(req.body.amenities),
      furnishing_items: parseArrayField(req.body.furnishingItems || req.body.furnishing_items),
      nearby_places: parseNearbyPlaces(req),
      description: req.body.description || null,

      // Rent Fields
      listing_type: req.body.listing_type || 'rent',
      monthly_rent: req.body.monthly_rent || null,
      security_deposit: req.body.security_deposit || null,
      maintenance_extra: req.body.maintenance_extra === 'true' || req.body.maintenance_extra === true || req.body.maintenance_extra === 1 || req.body.maintenance_extra === '1' ? 1 : 0,
      maintenance_charge: req.body.maintenance_charge || null,
      preferred_tenants: (() => {
        const val = req.body.preferred_tenants;
        if (!val) return null;
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed.join(', ');
          } catch (e) {}
          return val;
        }
        if (Array.isArray(val)) return val.join(', ');
        return String(val);
      })(),
      lock_in_period: req.body.lock_in_period ? Number(req.body.lock_in_period) : null,
      notice_period: req.body.notice_period || null,
      agreement_duration: req.body.agreement_duration ? Number(req.body.agreement_duration) : null,
      available_from: req.body.available_from || null,
    };

    // Auto-resolve latitude and longitude coordinates
    let latitude = null;
    let longitude = null;
    const socId = propertyData.society_id || req.body.society_id || req.body.society;
    
    // Check if society_id changed or if coordinates are not set in database
    const existing = await RentalProperty.getById(id);
    if (existing) {
      latitude = existing.latitude;
      longitude = existing.longitude;
    }

    const societyChanged = existing && (existing.society_id !== socId || existing.society_name !== propertyData.society_name);
    const addressChanged = existing && (existing.location_name !== propertyData.location_name || existing.address !== propertyData.address || existing.city_name !== propertyData.city_name);

    if (!latitude || !longitude || societyChanged || addressChanged) {
      if (socId) {
        try {
          const [socRows] = await db.query(
            "SELECT latitude, longitude FROM societies WHERE id = ? OR society_name = ? LIMIT 1",
            [socId, socId]
          );
          if (socRows[0] && socRows[0].latitude && socRows[0].longitude) {
            latitude = parseFloat(socRows[0].latitude);
            longitude = parseFloat(socRows[0].longitude);
          }
        } catch (err) {
          console.warn("Could not inherit coordinates from society:", err);
        }
      }
      if ((!latitude || !longitude) && (propertyData.location_name || propertyData.address)) {
        const addr = `${propertyData.location_name || propertyData.address || ""}, ${propertyData.city_name || "Pune"}, Maharashtra`;
        const coords = await geocodeAddress(addr);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
        }
      }
    }
    propertyData.latitude = latitude;
    propertyData.longitude = longitude;

    await RentalProperty.update(id, propertyData);

    // Sync society photo labels back to the master society record
    if (req.body.society) {
      await syncSocietyPhotoLabels(req.body.society, finalPhotos);
    } else if (req.body.society_name) {
      await syncSocietyPhotoLabels(req.body.society_name, finalPhotos);
    }

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
          await RentalProperty.updateSlug(id, newSlug);
        }
      } catch (slugErr) {
        console.warn("Failed to update slug:", slugErr.message);
      }
    }

    return res.json({
      success: true,
      message: "Rental property updated successfully",
      data: {
        id,
        photos: finalPhotos,
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
      message: "Failed to update rental property",
      error: error.message,
    });
  }
};

const deleteProperty = async (req, res) => {
  try {
    await RentalProperty.delete(req.params.id);
    res.json({ success: true, message: "Rental property deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete rental property",
      error: error.message,
    });
  }
};

const addPhotosToProperty = async (req, res) => {
  try {
    const photoPublicPaths = (req.files?.photos || []).map(toPublic);

    if (photoPublicPaths.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No photos provided",
      });
    }

    await RentalProperty.addPhotos(req.params.id, photoPublicPaths);

    res.json({
      success: true,
      message: `${photoPublicPaths.length} photos added successfully`,
      data: { addedPhotos: photoPublicPaths.length },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to add photos",
      error: error.message,
    });
  }
};

const deletePhotosFromProperty = async (req, res) => {
  try {
    const { photoUrls } = req.body;
    if (!photoUrls || !Array.isArray(photoUrls)) {
      return res.status(400).json({
        success: false,
        message: "Please provide array of photo URLs to delete",
      });
    }

    await RentalProperty.deleteSpecificPhotos(req.params.id, photoUrls);
    res.json({
      success: true,
      message: `Photos deleted successfully`,
      data: { deletedCount: photoUrls.length },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete photos",
      error: error.message,
    });
  }
};

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

const migratePropertyData = async (req, res) => {
  try {
    const result = await RentalProperty.migrateData();
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
      status,
      is_public,
      isPublic,
      visibility,
      publicOnly,
    } = req.query;

    const PRICE_COL = 'monthly_rent';

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

    if (city) {
      filters.push('LOWER(city_name) LIKE ?');
      values.push(`%${String(city).toLowerCase()}%`);
    }

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

    if (minP !== null) { filters.push(`${PRICE_COL} >= ?`); values.push(minP); }
    if (maxP !== null) { filters.push(`${PRICE_COL} <= ?`); values.push(maxP); }

    if (propertyType) {
      const arr = String(propertyType)
        .split(',')
        .map((s) => normalizePropertyType(s))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (arr.length === 1) { filters.push('LOWER(property_type_name) = ?'); values.push(arr[0]); }
      else if (arr.length > 1) { filters.push(`LOWER(property_type_name) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
    }

    if (propertySubtype) {
      const arr = String(propertySubtype).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (arr.length === 1) { filters.push('LOWER(property_subtype_name) = ?'); values.push(arr[0]); }
      else if (arr.length > 1) { filters.push(`LOWER(property_subtype_name) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
    }

    const unitInput = unitType || unitTypes;
    if (unitInput) {
      const arr = String(unitInput).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (arr.length === 1) { filters.push('LOWER(unit_type) = ?'); values.push(arr[0]); }
      else if (arr.length > 1) { filters.push(`LOWER(unit_type) IN (${arr.map(() => '?').join(',')})`); values.push(...arr); }
    }

    if (furnishing) {
      filters.push('LOWER(furnishing) = ?');
      values.push(String(furnishing).toLowerCase());
    }

    if (verified !== undefined) {
      filters.push('is_verified = ?');
      values.push(String(verified) === '1' || verified === true ? 1 : 0);
    }

    const publicParam = is_public || isPublic || visibility || publicOnly;
    if (publicParam !== undefined) {
      const isPublicValue = 
        publicParam === true || 
        publicParam === 1 || 
        String(publicParam).toLowerCase() === 'true' || 
        String(publicParam) === '1' || 
        String(publicParam).toLowerCase() === 'public';
      
      filters.push('is_public = ?');
      values.push(isPublicValue ? 1 : 0);
    }

    if (status) {
      const statusLower = String(status).toLowerCase();
      switch(statusLower) {
        case 'available':
          filters.push('is_available = 1');
          filters.push('is_sold = 0');
          break;
        case 'sold':
        case 'leased':
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
          console.warn(`Unknown status value: ${status}`);
      }
    }

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

    const floorMin = toNumOrNull(floor_min);
    const floorMax = toNumOrNull(floor_max);
    if (floorMin !== null) { filters.push('floor >= ?'); values.push(floorMin); }
    if (floorMax !== null) { filters.push('floor <= ?'); values.push(floorMax); }

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
      owner_name, owner_id, lead_id, assigned_to,
      property_type_name, property_subtype_name, unit_type, wing, unit_no,
      furnishing, bedrooms, bathrooms, facing, parking_type, parking_qty,
      city_name, location_name, society_name, floor, total_floors,
      carpet_area, builtup_area, budget, price_type, final_price,
      address, status, lead_source, ownership_doc_path,
      photos, amenities, furnishing_items, nearby_places, description,
      created_at, updated_at,
      is_public, is_private, is_sold, is_available, is_new_listing, is_premium, is_verified, is_featured,
      publication_date, created_by, updated_by,
      public_views, public_inquiries, slug,
      listing_type, monthly_rent, security_deposit, maintenance_extra, maintenance_charge,
      preferred_tenants, lock_in_period, notice_period, agreement_duration, available_from
    `.replace(/\s+/g, ' ').trim();

    let sql = `SELECT ${SELECT_COLUMNS} FROM rental_properties${whereClause}`;
    let finalValues = [...values];

    if (sort) {
      switch (sort) {
        case 'low_to_high':
          sql += ` ORDER BY ${PRICE_COL} ASC`;
          break;
        case 'high_to_low':
          sql += ` ORDER BY ${PRICE_COL} DESC`;
          break;
        case 'newest':
          sql += ' ORDER BY created_at DESC';
          break;
        default:
          sql += ` ORDER BY ${PRICE_COL} ASC`;
      }
    } else {
      sql += ` ORDER BY ${PRICE_COL} ASC`;
    }

    db.query(sql, finalValues, (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, data: results, count: results.length });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

const getPropertyBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const m = String(slug).match(/^(\d+)(?:-|$)/);
    if (!m)
      return res.status(400).json({ success: false, message: "Invalid slug format" });
    
    const id = Number(m[1]);
    const property = await RentalProperty.getById(id);
    if (!property)
      return res.status(404).json({ success: false, message: "Rental property not found" });

    if (property.slug && property.slug !== slug) {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      return res.redirect(301, `/properties/${property.slug}${qs}`);
    }

    const xff = req.headers["x-forwarded-for"];
    const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
    const userAgent = req.get("User-Agent") || null;
    const referrer = req.get("Referrer") || req.get("Referer") || null;
    
    const sessionId = getOrCreateSessionId(req, res);
    const { token: extractedFilterToken, key: filterParamKey } = extractFilterTokenFromReq(req);

    try {
      const safePayload = {
        query: req.query || {},
        filterToken: extractedFilterToken,
        filterParamKey: filterParamKey,
      };

      await RentalProperty.recordEvent({
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
      console.warn("analytics error:", e.message);
    }

    res.json({ success: true, data: property });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

async function recordEventHandler(req, res) {
  try {
    const idRaw = req.params.id;
    const propertyId = idRaw ? Number(String(idRaw).replace(/[^0-9]/g, "")) : null;
    if (!propertyId || Number.isNaN(propertyId)) {
      return res.status(400).json({ success: false, message: "Missing or invalid property id" });
    }

    const {
      source = req.body.source ?? "client",
      path = req.body.path ?? null,
      referrer = req.body.referrer ?? (req.get ? req.get("Referer") : null),
      slug = req.query.slug ?? req.body.slug ?? null,
      dedupe_key = req.body.dedupe_key ?? null,
      session_id = req.body.session_id ?? null,
      minutes_window = Number(req.body.minutes_window ?? 1),
    } = req.body || {};

    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    const userAgent = req.get ? req.get("User-Agent") || null : null;

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

    if (!Views || typeof Views.recordView !== "function") {
      return res.status(500).json({ success: false, message: "Server misconfiguration" });
    }

    const result = await Views.recordView(payload);
    return res.json({
      success: true,
      recorded: !!result.inserted,
      meta: result.meta || {},
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

const saveFilterContextHandler = async (req, res) => {
  try {
    const { filters, user_id = null } = req.body;
    if (!filters) {
      return res.status(400).json({ success: false, message: "filters required" });
    }
    const result = await RentalProperty.saveFilterContext(filters, user_id);
    return res.json({ success: true, id: result.id });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getFilterContextHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "id required" });
    const ctx = await RentalProperty.getFilterContextById(id);
    if (!ctx) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, context: ctx });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const searchCityLocationsStrict = async (req, res) => {
  try {
    const cityInput = (req.query.city || req.query.city_name || "").toString().trim();
    if (!cityInput) {
      return res.status(400).json({ success: false, message: "City parameter is required" });
    }
    
    let locationsInput = req.query.locations || req.query.location_name || "";
    let locArr = [];
    if (locationsInput) {
      if (typeof locationsInput === "string") {
        locArr = locationsInput.split(",").map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(locationsInput)) {
        locArr = locationsInput.map(s => String(s).trim()).filter(Boolean);
      }
      locArr = Array.from(new Set(locArr.map(s => s.toLowerCase()))).slice(0, 5);
    }
    
    const propertyType = (req.query.propertyType || req.query.property_type || "").toString().trim();
    const status = (req.query.status || "").toString().trim();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    
    const filters = [];
    const values = [];
    
    filters.push("LOWER(TRIM(city_name)) = ?");
    values.push(cityInput.toLowerCase());
    
    if (locArr.length > 0) {
      const locationConditions = locArr.map(() => "LOWER(TRIM(location_name)) LIKE ?").join(" OR ");
      filters.push(`(${locationConditions})`);
      locArr.forEach(loc => values.push(`%${loc}%`));
    }
    
    if (propertyType) {
      filters.push("LOWER(TRIM(property_type_name)) = ?");
      values.push(propertyType.toLowerCase());
    }
    
    if (status) {
      const statusLower = status.toLowerCase();
      switch(statusLower) {
        case 'available':
          filters.push("(status = 'Available' OR status = 'Active' OR status IS NULL)");
          filters.push("is_public = 1");
          filters.push("(is_sold = 0 OR is_sold IS NULL)");
          break;
        case 'leased':
        case 'sold':
          filters.push("(status = 'Sold' OR status = 'Leased' OR is_sold = 1)");
          break;
        case 'new':
          filters.push("is_new_listing = 1");
          filters.push("is_public = 1");
          break;
        default:
          filters.push("LOWER(TRIM(status)) = ?");
          values.push(statusLower);
          filters.push("is_public = 1");
      }
    } else {
      filters.push("is_public = 1");
      filters.push("(is_sold = 0 OR is_sold IS NULL)");
      filters.push("(status = 'Available' OR status = 'Active' OR status IS NULL)");
    }
    
    const whereClause = filters.length > 0 ? " WHERE " + filters.join(" AND ") : "";
    const countSql = `SELECT COUNT(*) AS total FROM rental_properties${whereClause}`;
    const [countRows] = await db.query(countSql, values);
    const total = countRows?.[0]?.total || 0;
    
    const dataSql = `
      SELECT * FROM rental_properties
      ${whereClause}
      ORDER BY is_featured DESC, is_premium DESC, updated_at DESC, created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataValues = [...values, limit, offset];
    const [dataRows] = await db.query(dataSql, dataValues);
    
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
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const PublicgetAllProperties = async (req, res) => {
  try {
    const properties = await RentalProperty.getAll();
    const sanitized = properties.map((p) => {
      const { ownership_doc_path, ...safe } = p;
      return safe;
    });
    res.json({ success: true, data: sanitized });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch properties", error: error.message });
  }
};

const PublicgetPropertyBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    const m = String(slug).match(/^(\d+)(?:-|$)/);
    if (!m) return res.status(400).json({ success: false, message: "Invalid slug format" });

    const id = Number(m[1]);
    let property = await RentalProperty.getById(id);
    let isResale = false;
    if (!property) {
      property = await Property.getById(id);
      if (property) isResale = true;
    }
    if (!property) return res.status(404).json({ success: false, message: "Rental property not found" });

    if (property.slug && property.slug !== slug) {
      const targetRoute = isResale ? '/api/properties/pro-page/' : '/api/rental-properties/pro-page/';
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      return res.redirect(301, `${targetRoute}${property.slug}${qs}`);
    }

    const xff = req.headers["x-forwarded-for"];
    const ip = xff ? String(xff).split(",")[0].trim() : req.ip || null;
    const userAgent = req.get("User-Agent") || null;
    const referrer = req.get("Referrer") || null;

    const sessionId = getOrCreateSessionId(req, res);
    const { token: extractedFilterToken, key: filterParamKey } = extractFilterTokenFromReq(req);

    try {
      const safePayload = {
        query: req.query || {},
        filterToken: extractedFilterToken,
        filterParamKey: filterParamKey,
      };

      await RentalProperty.recordEvent({
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
      console.warn("analytics error:", e.message);
    }

    const { ownership_doc_path, ...safeProperty } = property;
    res.json({ success: true, data: safeProperty });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const PublicgetProperty = async (req, res) => {
  try {
    const property = await RentalProperty.getById(req.params.id);
    if (!property) return res.status(404).json({ success: false, message: "Rental property not found" });

    const SENSITIVE_KEYS = ["ownership_doc_path", "ownershipDoc", "internal_notes", "created_by", "updated_by"];
    const copy = { ...property };
    SENSITIVE_KEYS.forEach((key) => delete copy[key]);

    return res.json({ success: true, data: copy });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch property", error: error.message });
  }
};

const importBulk = async (req, res) => {
  const rows = req.body.rows;
  const results = [];
  for (const row of rows) {
    try {
      await RentalProperty.create(row);
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
      return res.status(400).json({ success: false, message: "assigned_to required" });
    }

    const assigned_by = req.user?.id ?? null;
    const result = await RentalProperty.updateAssignedTo(id, assigned_to, assigned_by);

    if (assigned_to) {
      try {
        const [propRows] = await db.query(
          "SELECT title FROM rental_properties WHERE id = ?",
          [id]
        );
        if (propRows && propRows.length > 0) {
          const propTitle = propRows[0].title;
          const { sendAssignmentNotification } = require("../utils/notificationHelper");
          await sendAssignmentNotification({
            userId: assigned_to,
            type: "property_assign",
            itemId: id,
            itemName: propTitle,
            message: `You have been assigned a new rental property: ${propTitle}`,
            link: `/dashboard/rental-properties`
          });
        }
      } catch (err) {
        console.error("Failed to send property assignment notification:", err);
      }
    }

    return res.json({
      success: true,
      affected: result.affected,
      message: result.affected ? "assigned_to updated" : "No rows updated",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};

const getSimilarProperties = async (req, res) => {
  try {
    const q = req.query || {};
    const toInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const property_id = toInt(q.property_id || q.propertyId || q.id);
    const city = q.city;
    const location = q.location;
    const bedrooms = toInt(q.bedrooms);
    const limit = toInt(q.limit) ?? 6;

    const filters = {
      exclude_id: property_id,
      propertyId: property_id,
      city,
      location,
      bedrooms,
      limit,
    };

    if (property_id) {
      try {
        const current = await RentalProperty.getById(property_id);
        if (current) {
          filters.city = filters.city || current.city_name;
          filters.location = filters.location || current.location_name;
          filters.bedrooms = filters.bedrooms ?? current.bedrooms;
        }
      } catch (e) {}
    }

    const similarProperties = await RentalProperty.getSimilarProperties(filters);
    return res.json({
      success: true,
      data: similarProperties,
      count: similarProperties.length,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch similar properties" });
  }
};

const getPopularLocations = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 5;
    const popularLocations = await RentalProperty.getPopularLocations(limit);
    return res.json({ success: true, data: popularLocations });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch popular locations" });
  }
};

const patchPropertyOwner = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const propertyId = Number(req.params.id);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      conn.release();
      return res.status(400).json({ success: false, message: 'Invalid property id.' });
    }

    const { action, owner_id } = req.body; // action: 'link' | 'unlink'

    await conn.beginTransaction();

    if (action === 'unlink') {
      // Clear owner from this property only
      await conn.query(
        'UPDATE rental_properties SET owner_id = NULL, owner_name = NULL WHERE id = ?',
        [propertyId]
      );
    } else if (action === 'link' && owner_id) {
      const oid = Number(owner_id);
      if (!Number.isFinite(oid) || oid <= 0) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ success: false, message: 'Invalid owner_id.' });
      }
      // Fetch owner info
      const [[ownerRow]] = await conn.query(
        'SELECT id, name, assigned_to FROM owners WHERE id = ? LIMIT 1',
        [oid]
      );
      if (!ownerRow) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ success: false, message: 'Owner not found.' });
      }
      // Link: set owner_id, owner_name, assigned_to on this property
      await conn.query(
        'UPDATE rental_properties SET owner_id = ?, owner_name = ?, assigned_to = ? WHERE id = ?',
        [ownerRow.id, ownerRow.name, ownerRow.assigned_to || null, propertyId]
      );
    } else {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ success: false, message: 'action must be "link" or "unlink".' });
    }

    await conn.commit();
    conn.release();
    return res.json({ success: true, message: 'Property owner updated successfully.' });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    console.error('patchPropertyOwner error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update property owner.' });
  }
};

const getRentalAiAnalysis = async (req, res) => {
  try {
    const Integration = require("../models/integration.model");
    const {
      unit_type = '2 BHK',
      location = 'Pune',
      society_name = '',
      monthly_rent = 25000,
      carpet_area = 900,
      furnishing = 'Semi-Furnished',
    } = req.body || {};

    const rentNum = Number(monthly_rent) || 25000;
    const areaNum = Number(carpet_area) || 900;
    const rentPerSqFt = Math.round(rentNum / (areaNum || 900));
    const estimatedYield = (((rentNum * 12) / (areaNum * 6200)) * 100).toFixed(1);
    const rentalScore = Math.min(99, Math.max(86, 88 + (String(furnishing).toLowerCase().includes('furn') ? 6 : 2)));

    let aiInsight = `${unit_type} in ${society_name ? society_name + ', ' : ''}${location} demonstrates high tenant demand, particularly among working professionals and families. At ₹${rentPerSqFt}/sq.ft., the property is priced competitively with estimated rental yield of ~${estimatedYield}%.`;

    try {
      const apiKey = await Integration.getSetting("chatgpt", "api_key");
      const model = (await Integration.getSetting("chatgpt", "model")) || "gpt-4o-mini";
      if (apiKey) {
        const prompt = `Provide a concise 2-sentence real-estate rental market analysis for a ${unit_type} rental home in ${society_name || ''} ${location} with monthly rent ₹${rentNum}, carpet area ${areaNum} sqft, and ${furnishing} status. Focus on tenant demand, locality liquidity, and rental yield. Return only the concise 2-sentence analysis text.`;
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: "You are an expert real estate AI analyst specializing in Indian rental property markets." },
              { role: "user", content: prompt },
            ],
            max_tokens: 150,
            temperature: 0.7,
          }),
        });
        if (r.ok) {
          const gptData = await r.json();
          const gptText = gptData?.choices?.[0]?.message?.content?.trim();
          if (gptText) {
            aiInsight = gptText;
          }
        }
      }
    } catch (gptErr) {
      console.warn("ChatGPT rental analysis note:", gptErr.message);
    }

    return res.json({
      success: true,
      data: {
        rental_score: `${rentalScore}/100`,
        rent_per_sqft: `₹${rentPerSqFt}/sq ft`,
        estimated_yield: `${estimatedYield}%`,
        locality_demand: rentNum <= 30000 ? "High Demand (+14.2% YoY)" : "Moderate to High Demand",
        rent_fair_value: "Fair Market Value",
        avg_occupancy: "98.4%",
        ai_insight: aiInsight,
      }
    });
  } catch (err) {
    console.error("getRentalAiAnalysis error:", err);
    return res.status(500).json({ success: false, message: "Failed to generate AI analysis" });
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
  PublicgetAllProperties,
  PublicgetPropertyBySlug,
  PublicgetProperty,
  updateAssignedTo,
  getSimilarProperties,
  getPopularLocations,
  patchPropertyOwner,
  getRentalAiAnalysis,
};
