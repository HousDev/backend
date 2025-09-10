// controllers/propertyStatus.controller.js

const PropertyStatusHistory = require("../models/PropertyStatusHistory");

// Update property status + create history
exports.updatePropertyStatus = async (req, res) => {
  try {
    const { propertyId } = req.params;

    // Validate required fields
    const { status, remarks, updateReason, updatedBy } = req.body;

    if (!status || !remarks || !updateReason || !updatedBy) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: status, remarks, updateReason, updatedBy",
      });
    }

    // Call the model method to update status and create history
    const result = await PropertyStatusHistory.updatePropertyStatus(
      propertyId,
      req.body
    );

    res.json({
      success: true,
      message: "Property status updated and history recorded",
      ...result,
    });
  } catch (error) {
    console.error("updatePropertyStatus failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get history by property
exports.getPropertyStatusHistory = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!propertyId) {
      return res.status(400).json({
        success: false,
        error: "Property ID is required",
      });
    }

    const history = await PropertyStatusHistory.getByPropertyId(propertyId);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("getPropertyStatusHistory failed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
