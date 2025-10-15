// controllers/emailIntegrationController.js
const EmailIntegration = require("../models/EmailIntegration");

exports.getEmailIntegration = async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const config = await EmailIntegration.findEmailConfigByUser(userId);

    if (!config) {
      return res
        .status(404)
        .json({ success: false, message: "No email configuration found" });
    }

    return res.json({ success: true, data: config });
  } catch (error) {
    console.error("getEmailIntegration error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch email integration" });
  }
};

exports.saveEmailIntegration = async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const {
      driver,
      config: {
        smtp_provider,
        provider_name,
        host,
        port,
        security,
        username,
        password,
        from_address,
        from_name,
      },
    } = req.body;

    if (!provider_name || !from_address) {
      return res
        .status(400)
        .json({
          success: false,
          message: "provider_name and from_address are required",
        });
    }

    await EmailIntegration.saveOrUpdateEmailConfig(
      userId,
      provider_name,
      driver,
      host,
      port,
      security,
      username,
      password,
      from_address,
      from_name
    );

    const updated = await EmailIntegration.findEmailConfigByUser(userId);

    res.json({
      success: true,
      message: "Email configuration saved successfully",
      data: updated,
    });
  } catch (error) {
    console.error("saveEmailIntegration error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save email integration" });
  }
};

exports.toggleEmailIntegration = async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const { active } = req.body;

    await EmailIntegration.toggleActiveStatus(userId, active);

    const updated = await EmailIntegration.findEmailConfigByUser(userId);

    res.json({
      success: true,
      message: `Email integration ${active ? "activated" : "deactivated"}`,
      data: updated,
    });
  } catch (error) {
    console.error("toggleEmailIntegration error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to toggle email integration" });
  }
};

exports.syncEmailIntegration = async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    await EmailIntegration.updateLastSync(userId);
    const updated = await EmailIntegration.findEmailConfigByUser(userId);
    res.json({
      success: true,
      message: "Email integration synced successfully",
      data: updated,
    });
  } catch (error) {
    console.error("syncEmailIntegration error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to sync email integration" });
  }
};
