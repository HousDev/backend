const SMSIntegration = require("../models/smsIntegrationModel");

// ✅ Dynamic provider SMS sender
const sendSMS = async (config, to, message) => {
  switch (
    config.provider.toLowerCase() // 👈 case-insensitive check
  ) {
    case "twilio": {
      const twilio = require("twilio");
      const client = twilio(config.api_key, config.token);
      return await client.messages.create({
        body: message,
        from: config.sms_number,
        to,
      });
    }
    default:
      throw new Error(`Provider not supported yet: ${config.provider}`);
  }
};

// ✅ Save or Update Config
const saveSMSConfig = async (req, res) => {
  try {
    let { provider, apiKey, token, smsNumber, smsFrom } = req.body;
    const userId = req.userId;

    if (!provider || !apiKey || !token || !smsNumber || !smsFrom) {
      return res
        .status(400)
        .send({ success: false, message: "All fields are required" });
    }

    // 👇 Always save provider in lowercase
    provider = provider.toLowerCase();

    await SMSIntegration.saveOrUpdateSMSConfig(
      userId,
      provider,
      apiKey,
      token,
      smsNumber,
      smsFrom
    );

    res.send({
      success: true,
      message: "SMS configuration saved successfully",
    });
  } catch (err) {
    console.error("Save Config Error:", err);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

// ✅ Get SMS Config
const getSMSConfig = async (req, res) => {
  try {
    if (!req.userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID missing in request" });
    }

    const config = await SMSIntegration.findSMSConfigByUser(req.userId);

    // 🔹 Agar config null/undefined hai to bhi empty array bhejo
    return res.status(200).json({
      success: true,
      data: config || [],
    });
  } catch (err) {
    console.error("Get Config Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ✅ Sync Now
const syncNow = async (req, res) => {
  try {
    await SMSIntegration.updateLastSync(req.userId);
    res.send({
      success: true,
      message: "Sync completed successfully",
      last_sync: new Date(),
    });
  } catch (err) {
    console.error("Sync Error:", err);
    res.status(500).send({ success: false, message: "Sync failed" });
  }
};

// ✅ Toggle Active/Inactive
const toggleSMSConfig = async (req, res) => {
  try {
    const { active } = req.body;
    if (typeof active === "undefined") {
      return res
        .status(400)
        .send({ success: false, message: "Active status is required" });
    }

    await SMSIntegration.toggleActiveStatus(req.userId, active);
    res.send({
      success: true,
      message: active ? "Integration activated" : "Integration deactivated",
    });
  } catch (err) {
    console.error("Toggle error:", err);
    res
      .status(500)
      .send({ success: false, message: "Failed to update active status" });
  }
};

module.exports = {
  saveSMSConfig,
  getSMSConfig,
  
  syncNow,
  toggleSMSConfig,
};
