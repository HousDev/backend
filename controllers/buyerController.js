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
    const [rows] = await db.execute("SELECT * FROM buyers ORDER BY created_at DESC");

    // Ensure nested objects are strings
    const safeBuyers = rows.map(buyer => ({
      ...buyer,
      requirements: typeof buyer.requirements === "object" 
        ? JSON.stringify(buyer.requirements) 
        : buyer.requirements,
      financials: typeof buyer.financials === "object" 
        ? JSON.stringify(buyer.financials) 
        : buyer.financials,
      budget: { min: buyer.budget_min, max: buyer.budget_max },
    }));

    res.status(200).json(safeBuyers);
  } catch (error) {
    console.error("Error fetching buyers:", error);
    res.status(500).json({ error: "Failed to fetch buyers", details: error.message });
  }
};


// Get single buyer by ID
exports.getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) return res.status(404).json({ error: "Buyer not found" });
    res.status(200).json(buyer);
  } catch (error) {
    console.error("Error fetching buyer:", error);
    res.status(500).json({ error: "Failed to fetch buyer" });
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



exports.importBuyers = async (req, res) => {
  try {
    const buyers = req.body;
    if (!Array.isArray(buyers) || buyers.length === 0) {
      return res.status(400).json({ success: false, message: "No buyers provided for import" });
    }

    const createdBy = req.userId || 1;

    const result = await Buyer.bulkImport(buyers, createdBy);

    return res.status(201).json({
      success: true,
      message: "Import completed",
      inserted: result.inserted,
      skipped: result.skipped,
      skippedRows: result.skippedRows,
    });
  } catch (err) {
    console.error("Import Buyers Error:", err);
    return res.status(500).json({ success: false, message: "Server error during import", error: err.message });
  }
};

