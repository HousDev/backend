const Tenant = require("../models/Tenant");

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

    const tenant = await Tenant.create(body);
    return res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    console.error("Create tenant error:", err);
    return res.status(500).json({ success: false, message: "Failed to create tenant" });
  }
};

const updateTenant = async (req, res) => {
  try {
    const body = req.body || {};
    const affected = await Tenant.update(req.params.id, body);
    if (affected === 0) {
      return res.status(404).json({ success: false, message: "Tenant not found or no changes made" });
    }
    const updated = await Tenant.getById(req.params.id);
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
