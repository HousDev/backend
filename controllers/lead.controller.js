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
  let connection;
  try {
    const leads = req.body;
    const createdBy = req.userId || 1;
    const skipped = [];
    let insertedCount = 0;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No leads provided" 
      });
    }

    // Get connection and start transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Phone parsing function (frontend के साथ identical)
    const parsePhoneNumber = (phoneValue) => {
      if (!phoneValue || String(phoneValue).trim() === "") return null;
      
      let phoneStr = String(phoneValue).trim();
      
      // Handle scientific notation
      if (phoneStr.includes("E+") || phoneStr.includes("e+")) {
        try {
          const number = parseFloat(phoneStr);
          if (!isNaN(number)) {
            phoneStr = Math.round(number).toString();
          }
        } catch (error) {
          console.warn("Error parsing phone:", phoneStr);
        }
      }
      
      // Clean phone number - frontend जैसा ही
      phoneStr = phoneStr.replace(/[^\d+]/g, "");
      
      // Format consistently with frontend
      if (phoneStr.startsWith("+91")) {
        return phoneStr;
      } else if (phoneStr.startsWith("91") && phoneStr.length > 10) {
        return "+" + phoneStr;
      } else {
        phoneStr = phoneStr.replace(/^0+/, "");
        return phoneStr.length >= 10 ? phoneStr : null;
      }
    };

    // Extract phones and emails for batch duplicate checking
    const phonesToCheck = [];
    const emailsToCheck = [];
    
    const processedLeads = leads.map(lead => {
      const phone = parsePhoneNumber(lead.phone);
      const email = lead.email ? lead.email.toLowerCase().trim() : "";
      const whatsappNumber = lead.whatsapp_number ? parsePhoneNumber(lead.whatsapp_number) : "";
      
      if (phone) phonesToCheck.push(phone);
      if (email && email !== '') emailsToCheck.push(email);
      
      return { ...lead, parsedPhone: phone, parsedEmail: email, parsedWhatsapp: whatsappNumber };
    });

    // Batch check for existing duplicates
    const existingPhones = new Set();
    const existingEmails = new Set();

    if (phonesToCheck.length > 0 || emailsToCheck.length > 0) {
      let queryParts = [];
      const params = [];
      
      if (phonesToCheck.length > 0) {
        queryParts.push("phone IN (?)");
        params.push(phonesToCheck);
      }
      
      if (emailsToCheck.length > 0) {
        if (phonesToCheck.length > 0) queryParts.push(" OR ");
        queryParts.push("email IN (?)");
        params.push(emailsToCheck);
      }

      const query = `SELECT phone, email FROM client_leads WHERE ${queryParts.join('')}`;
      const [existingLeads] = await connection.query(query, params);

      existingLeads.forEach(lead => {
        if (lead.phone) {
          const parsedPhone = parsePhoneNumber(lead.phone);
          if (parsedPhone) existingPhones.add(parsedPhone);
        }
        if (lead.email && lead.email !== '') {
          existingEmails.add(lead.email.toLowerCase());
        }
      });
    }

    // Process each lead
    for (const [index, leadData] of processedLeads.entries()) {
      const { 
        parsedPhone: phone, 
        parsedEmail: email, 
        parsedWhatsapp: whatsappNumber,
        ...originalLead 
      } = leadData;

      // ✅ Mandatory field validation - FRONTEND के according
      const missingFields = [];
      if (!originalLead.salutation?.trim()) missingFields.push('Salutation');
      if (!originalLead.name?.trim()) missingFields.push('Name');
      if (!phone) missingFields.push('Phone');
      
      if (missingFields.length > 0) {
        skipped.push({
          row: index + 2,
          reason: `Missing mandatory fields: ${missingFields.join(', ')}`,
          data: { ...originalLead, parsedPhone: phone }
        });
        continue;
      }

      // ✅ Phone format validation
      const phoneRegex = /^[\+]?[\d]{10,13}$/;
      if (!phoneRegex.test(phone)) {
        skipped.push({
          row: index + 2,
          reason: `Invalid phone format: ${phone}`,
          data: { ...originalLead, parsedPhone: phone }
        });
        continue;
      }

      // ✅ Email validation (if provided)
      if (email && email !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          skipped.push({
            row: index + 2,
            reason: `Invalid email format: ${email}`,
            data: { ...originalLead, parsedPhone: phone }
          });
          continue;
        }
      }

      // ✅ Duplicate check
      let duplicateReason = '';
      if (email && email !== '' && existingEmails.has(email)) {
        duplicateReason = `Duplicate email: ${email}`;
      } else if (phone && existingPhones.has(phone)) {
        duplicateReason = `Duplicate phone: ${phone}`;
      }

      if (duplicateReason) {
        skipped.push({
          row: index + 2,
          reason: duplicateReason,
          data: { ...originalLead, parsedPhone: phone }
        });
        continue;
      }

      try {
        // ✅ Insert into database with EXACT column mapping
        await connection.query(
          `INSERT INTO client_leads 
          (id, salutation, name, phone, whatsapp_number, email, lead_type, lead_source, 
           stage, status, priority, state, city, location, assigned_executive,
           created_by, updated_by, created_at, updated_at,
           transferred_to_buyer, transferred_to_seller, is_listed) 
          VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, ?)`,
          [
            // Basic lead info
            originalLead.salutation || "",
            originalLead.name.trim(),
            phone,
            whatsappNumber || "",
            email || "",
            originalLead.lead_type || "",
            originalLead.lead_source || "",
            
            // Status fields with defaults
            originalLead.stage || "",
            originalLead.status || "new",
            originalLead.priority || "medium",
            
            // Location info
            originalLead.state || "",
            originalLead.city || "",
            originalLead.location || "",
            originalLead.assigned_executive || null,
            
            // User tracking
            createdBy,
            createdBy,
            
            // Default values for transfer flags
            0, // transferred_to_buyer
            0, // transferred_to_seller  
            0  // is_listed
          ]
        );

        insertedCount++;

        // ✅ Add to duplicate check sets
        if (email && email !== '') existingEmails.add(email);
        if (phone) existingPhones.add(phone);

      } catch (err) {
        // Individual row error - log but continue
        console.error(`❌ Row ${index + 2} insert error:`, err);
        
        skipped.push({
          row: index + 2,
          reason: `Database error: ${err.sqlMessage || err.message}`,
          data: { ...originalLead, parsedPhone: phone }
        });
        
        continue;
      }
    }

    // ✅ Commit transaction
    await connection.commit();

    // ✅ Final response - Frontend के according structure
    const response = {
      success: true,
      message: `Import completed successfully`,
      inserted: insertedCount,
      skipped: skipped.length,
      skippedRows: skipped // Frontend expects this field
    };

    res.status(201).json(response);

  } catch (err) {
    // ✅ Rollback in case of error
    if (connection) await connection.rollback();
    
    console.error("❌ Import process error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during import process",
      error: err.message,
    });
  } finally {
    // ✅ Release connection
    if (connection) connection.release();
  }
};

// controllers/leads.controller.js

exports.bulkAssignExecutives = async (req, res) => {
  try {
    const { ids, assigned_executive } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids must be a non-empty array" });
    }

    // "Unassigned" or empty = null
    const assignee =
      assigned_executive === '' || assigned_executive === null || assigned_executive === 'Unassigned'
        ? null
        : assigned_executive;

    const result = await Lead.bulkUpdateAssignedExecutive(ids, assignee);

    return res.status(200).json({
      success: true,
      message:
        assignee == null
          ? `Unassigned ${result.affectedCount} lead(s)`
          : `Assigned ${result.affectedCount} lead(s) to executive ${assignee}`,
      data: result,
    });
  } catch (err) {
    console.error("Bulk assign failed:", err);
    return res.status(500).json({ success: false, message: "Bulk assign failed", error: err.message });
  }
};
