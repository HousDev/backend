const Lead = require("../models/Lead");
const db = require("../config/database");


// ================= CREATE =================
exports.createLead = async (req, res) => {
  try {
    console.log("Incoming Lead Data (req.body):", req.body);

    const payload = {
      ...req.body,
      created_by: req.userId,
      updated_by: req.userId
    };

    const lead = await Lead.create(payload);

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: lead
    });
  } catch (err) {
    console.error("Create Lead Error:", err);

    // 🔹 Handle duplicate email/phone separately
    if (err.message.includes("Duplicate email")) {
      return res.status(409).json({ success: false, message: "Duplicate email already exists" });
    }
    if (err.message.includes("Duplicate phone")) {
      return res.status(409).json({ success: false, message: "Duplicate phone number already exists" });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create lead",
      error: err.message
    });
  }
};


exports.getLeads = async (req, res) => {
  try {
    const leads = await Lead.findAll();
    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch leads",
      error: err.message,
    });
  }
};

exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }
    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch lead",
      error: err.message,
    });
  }
};
// ================= UPDATE =================
exports.updateLead = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      updated_by: req.userId
    };

    const lead = await Lead.update(req.params.id, payload);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Lead updated successfully",
      data: lead,
    });
  } catch (err) {
    console.error("Update Lead Error:", err);

    // 🔹 Handle duplicate email/phone separately
    if (err.message.includes("Duplicate email")) {
      return res.status(409).json({ success: false, message: "Duplicate email already exists" });
    }
    if (err.message.includes("Duplicate phone")) {
      return res.status(409).json({ success: false, message: "Duplicate phone number already exists" });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update lead",
      error: err.message,
    });
  }
};



exports.deleteLead = async (req, res) => {
  try {
    await Lead.delete(req.params.id);
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to delete lead",
      error: err.message,
    });
  }
};

exports.getMasterData = async (req, res) => {
  try {
    const { type } = req.params;
    const data = await Lead.getMasterData(type);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch master data",
      error: err.message,
    });
  }
};

exports.updateAssignedExecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_executive } = req.body;

    if (!assigned_executive) {
      return res.status(400).json({ success: false, message: "assigned_executive is required" });
    }

    const updated = await Lead.updateAssignedExecutive(id, assigned_executive);

    if (!updated) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.status(200).json({
      success: true,
      message: `Lead ${id} assigned to executive ${assigned_executive}`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update lead", error: err.message });
  }
};


exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!status || !ids || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Status and ids are required",
      });
    }

    await Lead.bulkUpdateStatus(ids, status);

    // ✅ Use model instead of raw db
    const updatedLeads = await Lead.findByIds(ids);

    res.status(200).json({
      success: true,
      message: "Leads updated successfully",
      data: updatedLeads,
    });
  } catch (err) {
    console.error("Bulk update error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

exports.bulkDeleteLeads = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "IDs are required for bulk delete",
      });
    }

    await Lead.bulkDelete(ids);

    res.status(200).json({
      success: true,
      message: `Deleted ${ids.length} lead(s) successfully`,
      deletedIds: ids,
    });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete leads",
      error: err.message,
    });
  }
};


exports.importLeads = async (req, res) => {
  try {
    const leads = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, message: "No leads provided" });
    }

    const createdBy = req.userId || 1;
    const skipped = [];
    let insertedCount = 0;

    // ✅ Get all existing leads once (correct table name)
    const [existingLeads] = await db.query("SELECT email, phone FROM client_leads");

    // Create lookup sets
    const existingEmails = new Set(
      existingLeads.map((l) => (l.email ? l.email.toLowerCase() : null)).filter(Boolean)
    );
    const existingPhones = new Set(
      existingLeads.map((l) => (l.phone ? String(l.phone) : null)).filter(Boolean)
    );

    // ✅ Loop through new leads
    for (const [index, lead] of leads.entries()) {
      const email = lead.email ? lead.email.toLowerCase() : null;
      const phone = lead.phone ? String(lead.phone) : null;

      // Duplicate checks
      if (email && existingEmails.has(email)) {
        skipped.push({
          row: index + 2,
          reason: `Email already exists (${email})`,
          data: lead,
        });
        continue;
      }
      if (phone && existingPhones.has(phone)) {
        skipped.push({
          row: index + 2,
          reason: `Phone already exists (${phone})`,
          data: lead,
        });
        continue;
      }

      try {
        // ✅ Insert into DB
        await db.query(
          `INSERT INTO client_leads 
          (salutation, name, phone, email, lead_type, lead_source, whatsapp_number, 
           state, city, location, status, stage, priority, assigned_executive, 
           created_by, updated_by, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            lead.salutation || "",
            lead.name || "",
            phone,
            email,
            lead.lead_type || "",
            lead.lead_source || "",
            lead.whatsapp_number || "",
            lead.state || "",
            lead.city || "",
            lead.location || "",
            lead.status || "",
            lead.stage || "",
            lead.priority || "",
            lead.assigned_executive || "",
            createdBy,
            createdBy,
          ]
        );

        insertedCount++;

        // ✅ Add to sets so same file duplicates also get skipped
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);
      } catch (err) {
        console.error("❌ Row insert error:", err);
        skipped.push({
          row: index + 2,
          reason: "Unexpected DB error",
          data: lead,
        });
      }
    }

    // ✅ Final response
    res.status(201).json({
      success: true,
      message: "Import completed",
      inserted: insertedCount,
      skipped: skipped.length,
      skippedRows: skipped,
    });
  } catch (err) {
    console.error("❌ Import Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during import",
      error: err.message,
    });
  }
};
