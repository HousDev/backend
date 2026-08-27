const Tenant = require("../models/Tenant");
const { geocodeAddress } = require("../utils/geocoder");

async function geocodeTenantLocations(locStr) {
  if (!locStr) return null;
  const locations = String(locStr).split(/[;,]+/).map(s => s.trim()).filter(Boolean);
  if (locations.length === 0) return null;
  const coords = [];
  for (const loc of locations) {
    try {
      const geo = await geocodeAddress(`${loc}, Pune, Maharashtra`);
      if (geo && geo.latitude && geo.longitude) {
        coords.push({ name: loc, lat: geo.latitude, lng: geo.longitude });
      }
    } catch (e) {
      console.error(`Geocoding error for tenant location ${loc}:`, e);
    }
  }
  return coords.length > 0 ? JSON.stringify(coords) : null;
}

const getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.getAll();
    return res.status(200).json({ success: true, data: tenants });
  } catch (err) {
    console.error("Get tenants error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch tenants" });
  }
};

const getTenantById = async (req, res) => {
  try {
    const tenant = await Tenant.getById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    return res.status(200).json({ success: true, data: tenant });
  } catch (err) {
    console.error("Get tenant by id error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch tenant" });
  }
};

const createTenant = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.phone) {
      return res.status(400).json({ success: false, message: "Name and Phone are required." });
    }

    // Save tenant immediately without waiting for geocoding
    const tenant = await Tenant.create(body);
    if (!tenant) {
      return res.status(500).json({ success: false, message: "Failed to create tenant" });
    }

    // Fire-and-forget geocoding in background after response
    if (body.preferred_location) {
      setImmediate(async () => {
        try {
          const coords = await geocodeTenantLocations(body.preferred_location);
          if (coords) {
            await Tenant.update(tenant.id, { preferred_locations_coords: coords });
          }
        } catch (e) {
          console.error('Background geocoding failed for tenant:', tenant.id, e.message);
        }
      });
    }

    return res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    console.error("Create tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to create tenant: " + (err.message || '') });
  }
};

const updateTenant = async (req, res) => {
  try {
    const body = req.body || {};

    // Check if location changed — geocode in background after save
    const locationChanged = !!body.preferred_location && !body.preferred_locations_coords;
    
    // Check if property linking/unlinking is happening
    const isLinking = body.rental_property_id !== undefined;
    const oldTenant = isLinking ? await Tenant.getById(req.params.id) : null;

    const affected = await Tenant.update(req.params.id, body);
    if (affected === 0) {
      return res.status(404).json({ success: false, message: "Tenant not found or no changes made" });
    }
    const updated = await Tenant.getById(req.params.id);

    // If linking changed, log it in tenant activities
    if (isLinking && oldTenant && String(oldTenant.rental_property_id) !== String(updated.rental_property_id)) {
      const tenantActivityModel = require("../models/tenantActivityModel");
      if (updated.rental_property_id) {
        await tenantActivityModel.create({
          tenant_id: req.params.id,
          activity_type: "Property Linked",
          notes: `Linked rental property RENT-${updated.rental_property_id} (${updated.property_title || ''})`,
        });
      } else {
        await tenantActivityModel.create({
          tenant_id: req.params.id,
          activity_type: "Property Unlinked",
          notes: `Unlinked rental property RENT-${oldTenant.rental_property_id} (${oldTenant.property_title || ''})`,
        });
      }
    }

    // Fire-and-forget geocoding in background
    if (locationChanged) {
      setImmediate(async () => {
        try {
          const coords = await geocodeTenantLocations(body.preferred_location);
          if (coords) {
            await Tenant.update(req.params.id, { preferred_locations_coords: coords });
          }
        } catch (e) {
          console.error('Background geocoding failed for tenant update:', req.params.id, e.message);
        }
      });
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("Update tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to update tenant" });
  }
};

const deleteTenant = async (req, res) => {
  try {
    const affected = await Tenant.delete(req.params.id);
    if (affected === 0) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    return res.status(200).json({ success: true, message: "Tenant deleted successfully" });
  } catch (err) {
    console.error("Delete tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete tenant" });
  }
};

const bulkDeleteTenants = async (req, res) => {
  try {
    const ids = req.body.ids || [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "No tenant IDs provided" });
    }
    const affected = await Tenant.bulkDelete(ids);
    return res.status(200).json({ success: true, message: `${affected} tenants deleted successfully` });
  } catch (err) {
    console.error("Bulk delete tenants error:", err);
    return res.status(500).json({ success: false, message: "Failed to bulk delete tenants" });
  }
};

const bulkImportTenants = async (req, res) => {
  try {
    const { items } = req.body;
    const result = await Tenant.bulkImport(items);
    return res.json(result);
  } catch (err) {
    console.error("Bulk import tenants error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  bulkDeleteTenants,
  bulkImportTenants,
};
