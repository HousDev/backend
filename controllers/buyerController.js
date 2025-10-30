const Buyer = require("../models/Buyer");
const db = require("../config/database");

// Create buyer
exports.createBuyer = async (req, res) => {
  try {
    const buyerData = req.body;

    // Make sure requirements and financials are strings
    if (typeof buyerData.requirements !== 'string') {
      buyerData.requirements = JSON.stringify(buyerData.requirements || {});
    }
    
    if (typeof buyerData.financials !== 'string') {
      buyerData.financials = JSON.stringify(buyerData.financials || {});
    }

    // Ensure budget_min and budget_max are properly set
    buyerData.budget_min = buyerData.budget_min || null;
    buyerData.budget_max = buyerData.budget_max || null;

    const buyer = await Buyer.create(buyerData);
    res.status(201).json(buyer);
  } catch (error) {
    console.error("Error creating buyer:", error);
    res.status(500).json({ error: "Failed to create buyer", details: error.message });
  }
};

exports.getAllBuyers = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        b.*,

        -- creator
        u1.id          AS created_user_id,
        u1.salutation  AS created_user_salutation,
        u1.first_name  AS created_user_first_name,
        u1.last_name   AS created_user_last_name,
        u1.email       AS created_user_email,
        u1.phone       AS created_user_phone,

        -- assignee
        u2.id          AS assigned_user_id,
        u2.salutation  AS assigned_user_salutation,
        u2.first_name  AS assigned_user_first_name,
        u2.last_name   AS assigned_user_last_name,
        u2.email       AS assigned_user_email,
        u2.phone       AS assigned_user_phone

      FROM buyers b
      LEFT JOIN users u1 ON u1.id = b.created_by
      LEFT JOIN users u2 ON u2.id = b.assigned_executive
      ORDER BY b.created_at DESC
    `);

    const makeName = (sal, first, last) =>
      String([sal, first, last].filter(Boolean).join(" "))
        .replace(/\s+/g, " ")
        .trim() || null;

    // ✅ Hard de-dupe by buyer.id (keeps first occurrence respecting ORDER BY)
    const seenIds = new Set();
    const safeBuyers = [];

    for (const buyer of rows) {
      if (seenIds.has(buyer.id)) continue;
      seenIds.add(buyer.id);

      const created_by_user = buyer.created_user_id
        ? {
            id: buyer.created_user_id,
            name: makeName(
              buyer.created_user_salutation,
              buyer.created_user_first_name,
              buyer.created_user_last_name
            ),
            email: buyer.created_user_email || null,
            phone: buyer.created_user_phone || null,
          }
        : null;

      const assigned_executive_user = buyer.assigned_user_id
        ? {
            id: buyer.assigned_user_id,
            name: makeName(
              buyer.assigned_user_salutation,
              buyer.assigned_user_first_name,
              buyer.assigned_user_last_name
            ),
            email: buyer.assigned_user_email || null,
            phone: buyer.assigned_user_phone || null,
          }
        : null;

      safeBuyers.push({
        ...buyer,

        // keep nested as strings for API consumers (as you had)
        requirements:
          typeof buyer.requirements === "object"
            ? JSON.stringify(buyer.requirements)
            : buyer.requirements,
        financials:
          typeof buyer.financials === "object"
            ? JSON.stringify(buyer.financials)
            : buyer.financials,

        budget: { min: buyer.budget_min, max: buyer.budget_max },

        created_by_user,
        assigned_executive_user,
      });
    }

    res.status(200).json(safeBuyers);
  } catch (error) {
    console.error("Error fetching buyers:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch buyers", details: error.message });
  }
};




// Get single buyer by ID
// ==================== Get Buyer by ID ====================
exports.getBuyerById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.execute(`
      SELECT
        b.*,

        -- creator
        u1.id          AS created_user_id,
        u1.salutation  AS created_user_salutation,
        u1.first_name  AS created_user_first_name,
        u1.last_name   AS created_user_last_name,
        u1.email       AS created_user_email,
        u1.phone       AS created_user_phone,

        -- assignee
        u2.id          AS assigned_user_id,
        u2.salutation  AS assigned_user_salutation,
        u2.first_name  AS assigned_user_first_name,
        u2.last_name   AS assigned_user_last_name,
        u2.email       AS assigned_user_email,
        u2.phone       AS assigned_user_phone

      FROM buyers b
      LEFT JOIN users u1 ON u1.id = b.created_by
      LEFT JOIN users u2 ON u2.id = b.assigned_executive
      WHERE b.id = ?
      LIMIT 1
    `, [id]);

    if (!rows[0]) {
      return res.status(404).json({ error: "Buyer not found" });
    }

    const buyer = rows[0];

    const makeName = (sal, first, last) =>
      String([sal, first, last].filter(Boolean).join(" "))
        .replace(/\s+/g, " ")
        .trim() || null;

    const created_by_user = buyer.created_user_id
      ? {
          id: buyer.created_user_id,
          name: makeName(
            buyer.created_user_salutation,
            buyer.created_user_first_name,
            buyer.created_user_last_name
          ),
          email: buyer.created_user_email || null,
          phone: buyer.created_user_phone || null,
        }
      : null;

    const assigned_executive_user = buyer.assigned_user_id
      ? {
          id: buyer.assigned_user_id,
          name: makeName(
            buyer.assigned_user_salutation,
            buyer.assigned_user_first_name,
            buyer.assigned_user_last_name
          ),
          email: buyer.assigned_user_email || null,
          phone: buyer.assigned_user_phone || null,
        }
      : null;

    const safeBuyer = {
      ...buyer,

      requirements:
        typeof buyer.requirements === "object"
          ? JSON.stringify(buyer.requirements)
          : buyer.requirements,
      financials:
        typeof buyer.financials === "object"
          ? JSON.stringify(buyer.financials)
          : buyer.financials,

      budget: { min: buyer.budget_min, max: buyer.budget_max },

      created_by_user,
      assigned_executive_user,
    };

    res.status(200).json(safeBuyer);
  } catch (error) {
    console.error("Error fetching buyer:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch buyer", details: error.message });
  }
};


// Add these missing methods that your router references
exports.getBuyers = exports.getAllBuyers; // Alias for router compatibility

exports.updateBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing buyer id" });

    const payload = { ...req.body };

    // Ensure JSON strings
    if (payload.requirements && typeof payload.requirements !== "string") {
      payload.requirements = JSON.stringify(payload.requirements);
    }
    if (payload.financials && typeof payload.financials !== "string") {
      payload.financials = JSON.stringify(payload.financials);
    }

    // Optional numeric coercion
    if (payload.budget_min !== undefined) {
      payload.budget_min = Number(payload.budget_min) || 0;
    }
    if (payload.budget_max !== undefined) {
      payload.budget_max = Number(payload.budget_max) || 0;
    }

    const updated = await Buyer.update(id, payload);
    if (!updated) return res.status(404).json({ error: "Buyer not found" });

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating buyer:", error);
    return res.status(500).json({ error: "Failed to update buyer", details: error.message });
  }
};

exports.deleteBuyer = async (req, res) => {
  try {
    const id = Number(req.params.id || req.body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid id" });
    }

    const [rows] = await db.execute("SELECT id FROM buyers WHERE id = ?", [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "buyer not found" });
    }

    // 👉 Always hard delete
    const [result] = await db.execute("DELETE FROM buyers WHERE id = ?", [id]);

    return res.status(200).json({
      message: "Buyer permanently deleted",
      affectedRows: result.affectedRows ?? 0,
      id,
    });
  } catch (error) {
    console.error("Error deleting buyer:", error);
    return res.status(500).json({ error: "Failed to delete buyer", detail: error.message });
  }
};


exports.bulkDeleteBuyers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }

    const sanitizedIds = ids
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (sanitizedIds.length === 0) {
      return res.status(400).json({ error: "no valid numeric ids provided" });
    }

    const placeholders = sanitizedIds.map(() => "?").join(",");
    const [result] = await db.execute(
      `DELETE FROM buyers WHERE id IN (${placeholders})`,
      sanitizedIds
    );

    return res.status(200).json({
      message: "Buyers permanently deleted",
      affectedRows: result.affectedRows ?? 0,
      deletedIds: sanitizedIds,
    });
  } catch (error) {
    console.error("Error bulk deleting buyers:", error);
    return res.status(500).json({ error: "Failed to bulk delete buyers", detail: error.message });
  }
};

/* ==============================
   🔹 Assign Executive (Single)
============================== */
exports.assignExecutive = async (req, res) => {
  try {
    const { id } = req.params;
    const { executive_id } = req.body;

    if (!id) return res.status(400).json({ error: "Buyer ID required" });

    const result = await Buyer.assignExecutive(id, executive_id);
    const updated = await Buyer.findById(id);

    return res.json({
      success: true,
      message: `Executive ${executive_id ? "assigned" : "cleared"} successfully.`,
      affected: result.affected,
      buyer: updated,
    });
  } catch (err) {
    console.error("assignExecutive error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ==============================
   🔹 Bulk Assign Executive
============================== */
exports.bulkAssignExecutive = async (req, res) => {
  try {
    const { buyer_ids, executive_id, only_empty } = req.body;

    if (!Array.isArray(buyer_ids) || buyer_ids.length === 0)
      return res.status(400).json({ error: "buyer_ids array required" });

    const result = await Buyer.bulkAssignSameExecutive(buyer_ids, executive_id, !!only_empty);

    return res.json({
      success: true,
      message: `Executive ${executive_id ? "assigned" : "cleared"} for ${result.affected} buyers.`,
      affected: result.affected,
    });
  } catch (err) {
    console.error("bulkAssignExecutive error:", err);
    res.status(500).json({ error: err.message });
  }
};
/* ============================
   🔹 Update Single Lead Field
============================ */
exports.updateLeadField = async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;

    const result = await Buyer.updateLeadField(id, field, value);
    const updated = await Buyer.findById(id);

    res.json({
      success: true,
      message: `${field} updated successfully.`,
      affected: result.affected,
      buyer: updated,
    });
  } catch (err) {
    console.error("updateLeadField error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================
   🔹 Bulk Update Lead Field
============================ */
exports.bulkUpdateLeadField = async (req, res) => {
  try {
    const { buyer_ids, field, value, only_empty } = req.body;

    const result = await Buyer.bulkUpdateLeadField(buyer_ids, field, value, !!only_empty);

    res.json({
      success: true,
      message: `${field} updated for ${result.affected} buyers.`,
      affected: result.affected,
    });
  } catch (err) {
    console.error("bulkUpdateLeadField error:", err);
    res.status(500).json({ error: err.message });
  }
};



// controllers/buyerController.js

exports.importBuyers = async (req, res) => {
  try {
    // ---------- 1) Detect payload & the key used ----------
    const body = req.body ?? {};
    let rows = null;
    let keyName = null; // which key the client used (buyers / data / rows / rawArray)

    if (Array.isArray(body)) {
      rows = body;
      keyName = "array"; // raw array sent
    } else if (Array.isArray(body.buyers)) {
      rows = body.buyers;
      keyName = "buyers";
    } else if (Array.isArray(body.data)) {
      rows = body.data;
      keyName = "data";
    } else if (Array.isArray(body.rows)) {
      rows = body.rows;
      keyName = "rows";
    } else {
      // last resort: if there is exactly one array prop, accept that
      const arrKeys = Object.keys(body).filter((k) => Array.isArray(body[k]));
      if (arrKeys.length === 1) {
        keyName = arrKeys[0]; // support custom key
        rows = body[keyName];
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        code: "NO_BUYERS",
        message:
          "Provide buyers as an array (raw array) or inside one of these keys: buyers / data / rows",
      });
    }

    // ---------- 2) Context (created_by, etc.) ----------
    const userId =
      req.user?.id || req.userId || req.auth?.id || req.auth?.userId || null;

    // ---------- 3) Do the import ----------
    // Expect Buyer.bulkImport to return: { inserted, skipped, skippedRows, updatedRows, insertedRows }
    const result = await Buyer.bulkImport(rows, { created_by: userId });

    const base = {
      success: true,
      message: "Import completed",
      inserted: result.inserted ?? 0,
      skipped: result.skipped ?? (result.skippedRows?.length ?? 0),
      skippedRows: result.skippedRows || [],
      updatedRows: result.updatedRows || [],
      insertedRows: result.insertedRows || [],
    };

    // ---------- 4) Mirror the request format in the response ----------
    // If client sent { buyers: [...] }, reply with { buyers: <summary>, ...base }
    // If raw array, just send base.
    if (keyName && keyName !== "array") {
      return res.status(200).json({
        ...base,
        [keyName]: {
          inserted: base.inserted,
          skipped: base.skipped,
          skippedRows: base.skippedRows,
          updatedRows: base.updatedRows,
          insertedRows: base.insertedRows,
        },
      });
    }

    // raw array case
    return res.status(200).json(base);
  } catch (err) {
    console.error("Import Buyers Error:", err);
    return res.status(500).json({
      success: false,
      code: "IMPORT_FAILED",
      message: err?.message || "Server error during import",
    });
  }
};

