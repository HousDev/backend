// const SystemSettings = require("../models/SystemSettings");

// // GET settings
// exports.getSystemSettings = async (req, res) => {
//   try {
//     const settings = await SystemSettings.getSettings();
//     res.json({ success: true, data: settings });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching settings",
//       error: err.message,
//     });
//   }
// };
// exports.saveSystemSettings = async (req, res) => {
//   try {
//     const current = await SystemSettings.getSettings();
//     const data = { ...req.body };

//     // ✅ Logo Upload
//     if (req.files && req.files.company_logo) {
//       // agar naya logo aaya hai to purana delete bhi kar sakte (optional)
//       data.company_logo = `/uploads/system/${req.files.company_logo[0].filename}`;
//     } else if (data.remove_logo === "true") {
//       // agar delete button dabaya gaya hai
//       data.company_logo = null;
//     } else {
//       data.company_logo = current?.company_logo || null;
//     }

//     // ✅ Favicon Upload
//     if (req.files && req.files.company_favicon) {
//       data.company_favicon = `/uploads/system/${req.files.company_favicon[0].filename}`;
//     } else if (data.remove_favicon === "true") {
//       data.company_favicon = null;
//     } else {
//       data.company_favicon = current?.company_favicon || null;
//     }

//     // ✅ Normalize booleans
//     data.auto_assign_leads =
//       data.auto_assign_leads === "true" || data.auto_assign_leads == 1 ? 1 : 0;
//     data.lead_scoring_enabled =
//       data.lead_scoring_enabled === "true" || data.lead_scoring_enabled == 1
//         ? 1
//         : 0;
//     data.property_auto_approval =
//       data.property_auto_approval === "true" || data.property_auto_approval == 1
//         ? 1
//         : 0;

//     const saved = await SystemSettings.save(data);

//     res.json({
//       success: true,
//       data: saved,
//       message: "System settings updated successfully!",
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error saving settings",
//       error: err.message,
//     });
//   }
// };

const SystemSettings = require("../models/SystemSettings");

// -------------------- GET settings --------------------
exports.getSystemSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching settings",
      error: err.message,
    });
  }
};

// -------------------- SAVE settings --------------------
exports.saveSystemSettings = async (req, res) => {
  try {
    const current = await SystemSettings.getSettings();
    const data = { ...req.body };

    // ✅ Company Logo
    if (req.files && req.files.company_logo) {
      data.company_logo = `/uploads/system/${req.files.company_logo[0].filename}`;
    } else if (data.remove_logo === "true") {
      data.company_logo = null;
    } else {
      data.company_logo = current?.company_logo || null;
    }

    // ✅ Footer Logo
    if (req.files && req.files.footer_logo) {
      data.footer_logo = `/uploads/system/${req.files.footer_logo[0].filename}`;
    } else if (data.remove_footer_logo === "true") {
      data.footer_logo = null;
    } else {
      data.footer_logo = current?.footer_logo || null;
    }

    // ✅ Favicon
    if (req.files && req.files.company_favicon) {
      data.company_favicon = `/uploads/system/${req.files.company_favicon[0].filename}`;
    } else if (data.remove_favicon === "true") {
      data.company_favicon = null;
    } else {
      data.company_favicon = current?.company_favicon || null;
    }

    // ✅ Normalize booleans
    data.auto_assign_leads =
      data.auto_assign_leads === "true" || data.auto_assign_leads == 1 ? 1 : 0;
    data.lead_scoring_enabled =
      data.lead_scoring_enabled === "true" || data.lead_scoring_enabled == 1
        ? 1
        : 0;
    data.property_auto_approval =
      data.property_auto_approval === "true" || data.property_auto_approval == 1
        ? 1
        : 0;

    if (data.enable_inactivity_logout !== undefined) {
      data.enable_inactivity_logout =
        data.enable_inactivity_logout === "true" ||
        data.enable_inactivity_logout === true ||
        data.enable_inactivity_logout == 1
          ? 1
          : 0;
    }

    if (data.inactivity_timeout_minutes !== undefined) {
      const parsedMinutes = parseInt(data.inactivity_timeout_minutes, 10);
      data.inactivity_timeout_minutes = !isNaN(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 15;
    }

    if (data.enable_guest_property_limit !== undefined) {
      data.enable_guest_property_limit =
        data.enable_guest_property_limit === "true" ||
        data.enable_guest_property_limit === true ||
        data.enable_guest_property_limit == 1
          ? 1
          : 0;
    }

    if (data.guest_property_view_limit !== undefined) {
      const parsedLimit = parseInt(data.guest_property_view_limit, 10);
      data.guest_property_view_limit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
    }

    // ✅ Save in DB
    await SystemSettings.save(data);

    // ✅ Fetch fresh values from DB (to ensure latest response)
    const updated = await SystemSettings.getSettings();

    // ✅ Send fresh response back
    res.json({
      success: true,
      data: updated,
      message: "System settings updated successfully!",
    });
  } catch (err) {
    console.error("Error in saveSystemSettings:", err);
    res.status(500).json({
      success: false,
      message: "Error saving settings",
      error: err.message,
    });
  }
};
