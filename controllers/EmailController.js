const VendorModel = require("../models/VendorModel");
const { sendMail, getVendorRecommendationEmail } = require("../utils/mailer");

const sendVendorEmail = async (req, res) => {
  try {
    const {
      email,
      name,
      vendorIds,
      categories,
      serviceRequirements,
      message,
      companyName,
    } = req.body || {};

    const recipientEmail = String(email || "")
      .trim()
      .toLowerCase();
    if (!recipientEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Recipient email is required." });
    }

    const ids = Array.isArray(vendorIds)
      ? vendorIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];

    const uniqueIds = [...new Set(ids)];

    // Fetch only valid vendor records and ignore broken/null vendor records.
    const vendors = [];
    for (const id of uniqueIds) {
      try {
        const vendor = await VendorModel.getById(id);
        if (vendor && vendor.name && vendor.email) {
          vendors.push(vendor);
        }
      } catch (vendorErr) {
        console.warn(
          `[EmailController] Skipping invalid vendor id=${id}:`,
          vendorErr?.message || vendorErr,
        );
      }
    }

    const template = await getVendorRecommendationEmail({
      name,
      vendors,
      categories,
      serviceRequirements,
      message,
      companyName,
    });

    await sendMail({
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
    });

    return res.json({
      success: true,
      message: "Vendor recommendation email sent successfully.",
    });
  } catch (err) {
    console.error("[EmailController] sendVendorEmail error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to send vendor email.",
    });
  }
};

module.exports = { sendVendorEmail };
