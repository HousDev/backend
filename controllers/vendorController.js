const VendorModel = require("../models/VendorModel");

const createVendor = async (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.name || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Contact name is required." });
    }
    if (!String(body.businessName || body.business_name || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Business name is required." });
    }
    if (!String(body.phone || "").replace(/\D/g, "")) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number is required." });
    }
    if (!String(body.email || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Email address is required." });
    }

    const vendor = await VendorModel.create(body);
    return res.status(201).json({ success: true, data: vendor });
  } catch (error) {
    console.error("Create Vendor error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create vendor" });
  }
};

const getVendors = async (_req, res) => {
  try {
    const vendors = await VendorModel.getAll();
    return res.json({ success: true, data: vendors });
  } catch (error) {
    console.error("Get Vendors error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch vendors" });
  }
};
const getVendorCategoryCounts = async (_req, res) => {
  try {
    const data = await VendorModel.getVendorCategoryCounts();

    return res.json({
      success: true,
      total: data.total,
      categories: data.categories,
    });
  } catch (error) {
    console.error("Vendor Category Counts error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor counts",
    });
  }
};
const getVendorById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "Invalid vendor id" });
    const vendor = await VendorModel.getById(id);
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, data: vendor });
  } catch (error) {
    console.error("Get Vendor error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch vendor" });
  }
};

const updateVendor = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "Invalid vendor id" });

    const body = req.body || {};
    if (!String(body.name || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Contact name is required." });
    }

    const vendor = await VendorModel.update(id, body);
    if (!vendor)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    return res.json({ success: true, data: vendor });
  } catch (error) {
    console.error("Update Vendor error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update vendor" });
  }
};

const deleteVendor = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "Invalid vendor id" });
    const affected = await VendorModel.remove(id);
    if (!affected)
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete Vendor error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete vendor" });
  }
};

module.exports = {
  createVendor,
  getVendors,
  getVendorCategoryCounts,
  getVendorById,
  updateVendor,
  deleteVendor,
};
