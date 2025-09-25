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

// GET settings
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

// SAVE settings
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

    const saved = await SystemSettings.save(data);

    res.json({
      success: true,
      data: saved,
      message: "System settings updated successfully!",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error saving settings",
      error: err.message,
    });
  }
};
