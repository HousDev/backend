// controllers/integration.controller.js
const Integration = require("../models/integration.model");

/**
 * GET /integrations - Get all integrations grouped by tab
 */
const getAllIntegrations = async (req, res) => {
  try {
    const data = await Integration.getAllGrouped();
    res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("getAllIntegrations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch integrations",
      error: error.message,
    });
  }
};

/**
 * GET /integrations/:tab - Get single tab configuration
 */
const getIntegrationByTab = async (req, res) => {
  try {
    const { tab } = req.params;
    const validTabs = ["email", "sms", "whatsapp", "razorpay", "stripe", "chatgpt"];
    
    if (!validTabs.includes(tab)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tab name",
      });
    }

    const data = await Integration.getByTab(tab);
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Integration not found",
      });
    }

    res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error("getIntegrationByTab error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch integration",
      error: error.message,
    });
  }
};

/**
 * POST /integrations/:tab - Save configuration (upsert)
 */
const saveIntegrationConfig = async (req, res) => {
  try {
    const { tab } = req.params;
    const { config } = req.body;
    
    const validTabs = ["email", "sms", "whatsapp", "razorpay", "stripe", "chatgpt"];
    
    if (!validTabs.includes(tab)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tab name",
      });
    }

    if (!config || typeof config !== "object") {
      return res.status(400).json({
        success: false,
        message: "Config object is required",
      });
    }

    // Filter out null/undefined values
    const cleanedConfig = {};
    for (const [key, value] of Object.entries(config)) {
      if (value !== null && value !== undefined && value !== "") {
        cleanedConfig[key] = String(value);
      }
    }

    const data = await Integration.saveConfig(tab, cleanedConfig);
    
    res.json({
      success: true,
      message: "Integration configuration saved successfully",
      data: data,
    });
  } catch (error) {
    console.error("saveIntegrationConfig error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save integration configuration",
      error: error.message,
    });
  }
};

/**
 * PATCH /integrations/:tab/toggle - Enable/disable integration
 */
const toggleIntegration = async (req, res) => {
  try {
    const { tab } = req.params;
    const { is_active } = req.body;
    
    const validTabs = ["email", "sms", "whatsapp", "razorpay", "stripe", "chatgpt"];
    
    if (!validTabs.includes(tab)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tab name",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active boolean is required",
      });
    }

    // Check if config exists before enabling
    if (is_active) {
      const config = await Integration.getByTab(tab);
      if (!config || Object.keys(config.config).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot enable integration: No configuration found. Please configure first.",
        });
      }
    }

    const data = await Integration.toggleActive(tab, is_active);
    
    res.json({
      success: true,
      message: `Integration ${is_active ? "enabled" : "disabled"} successfully`,
      data: data,
    });
  } catch (error) {
    console.error("toggleIntegration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle integration",
      error: error.message,
    });
  }
};

/**
 * DELETE /integrations/:tab - Clear all configuration for a tab
 */
const clearIntegrationConfig = async (req, res) => {
  try {
    const { tab } = req.params;
    const validTabs = ["email", "sms", "whatsapp", "razorpay", "stripe", "chatgpt"];
    
    if (!validTabs.includes(tab)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tab name",
      });
    }

    await Integration.clearConfig(tab);
    
    res.json({
      success: true,
      message: "Integration configuration cleared successfully",
    });
  } catch (error) {
    console.error("clearIntegrationConfig error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear integration configuration",
      error: error.message,
    });
  }
};

/**
 * GET /integrations/:tab/validate - Validate required settings
 */
const validateIntegration = async (req, res) => {
  try {
    const { tab } = req.params;
    
    // Define required keys for each tab
    const requiredKeys = {
      email: ["host", "port", "username", "password", "from_address"],
      sms: ["sms_provider", "api_key", "token", "sms_number"],
      whatsapp: ["phone_number_id", "waba_id", "access_token"],
      razorpay: ["key_id", "key_secret", "webhook_secret"],
      stripe: ["publishable_key", "secret_key", "webhook_secret"],
      chatgpt: ["api_key"],
    };
    
    const keys = requiredKeys[tab];
    if (!keys) {
      return res.status(400).json({
        success: false,
        message: "Invalid tab name",
      });
    }
    
    const isValid = await Integration.validateConfig(tab, keys);
    const config = await Integration.getByTab(tab);
    
    // Get missing keys
    const missingKeys = [];
    if (!isValid && config) {
      for (const key of keys) {
        const value = await Integration.getSetting(tab, key);
        if (!value || value.trim() === "") {
          missingKeys.push(key);
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        is_valid: isValid,
        is_active: config ? config.is_active : false,
        missing_keys: missingKeys,
      },
    });
  } catch (error) {
    console.error("validateIntegration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate integration",
      error: error.message,
    });
  }
};

// ✅ CORRECT EXPORT - Make sure all functions are exported
module.exports = {
  getAllIntegrations,
  getIntegrationByTab,
  saveIntegrationConfig,
  toggleIntegration,
  clearIntegrationConfig,
  validateIntegration,
};