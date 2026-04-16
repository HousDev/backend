// src/controllers/propertyVisitsController.js
const PropertyVisit = require("../models/PropertyVisit");
const PropertyRevisit = require("../models/PropertyRevisit");

/* --------- helpers --------- */
const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

/* --------- VISITS (Parent) ---------- */

exports.createVisit = async (req, res) => {
  try {
    const buyer_id = toInt(req.body.buyer_id);
    const property_id = toInt(req.body.property_id);

    const hasSplit = !!(req.body.visit_date && req.body.visit_time);
    const hasISO = !!req.body.visit_datetime;

    if (!buyer_id || !property_id || (!hasSplit && !hasISO)) {
      return res.status(400).send({
        success: false,
        message:
          "buyer_id, property_id और (visit_date+visit_time) या visit_datetime जरूरी है.",
      });
    }

    const created = await PropertyVisit.create({
      ...req.body,
      buyer_id,
      property_id,
      status: req.body.status || "scheduled",
      duration_minutes: req.body.duration_minutes || 60,
      visit_type: req.body.visit_type || "site_visit",
      seller_present: req.body.seller_present ? 1 : 0,
      accompanied_by: req.body.accompanied_by, // array/object/string
    });

    return res.status(201).send({
      success: true,
      message: "Visit created successfully!",
      data: created,
    });
  } catch (err) {
    console.error("Error creating visit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error creating visit." });
  }
};

exports.getAllVisits = async (req, res) => {
  try {
    const {
      buyer_id,
      seller_id,
      property_id,
      executive_id,
      status,
      search,
      from_datetime,
      to_datetime,
      from_date,
      to_date,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {
      buyer_id: toInt(buyer_id),
      seller_id: toInt(seller_id),
      property_id: toInt(property_id),
      executive_id: toInt(executive_id),
      status,
      search,
      from_datetime,
      to_datetime,
      from_date,
      to_date,
    };

    const pagination = {
      page: toInt(page) || 1,
      limit: toInt(limit) || 20,
    };

    const { rows, total } = await PropertyVisit.getAll(filters, pagination);

    return res.send({
      success: true,
      data: rows,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        pages: Math.max(1, Math.ceil(total / pagination.limit)),
      },
    });
  } catch (err) {
    console.error("Error fetching visits:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error fetching visits." });
  }
};

exports.getVisitById = async (req, res) => {
  try {
    const visitId = toInt(req.params.visitId);
    if (!visitId) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid visitId." });
    }
    const data = await PropertyVisit.findWithRevisits(visitId);
    if (!data)
      return res
        .status(404)
        .send({ success: false, message: "Visit not found." });
    return res.send({ success: true, data });
  } catch (err) {
    console.error("Error retrieving visit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error retrieving visit." });
  }
};

exports.updateVisit = async (req, res) => {
  try {
    const visitId = toInt(req.params.visitId);
    if (!visitId)
      return res
        .status(400)
        .send({ success: false, message: "Invalid visitId." });

    // Prevent external change to revisit_count
    if ("revisit_count" in req.body) delete req.body.revisit_count;

    const updated = await PropertyVisit.updateById(visitId, req.body);
    if (updated?.kind === "not_found")
      return res
        .status(404)
        .send({ success: false, message: "Visit not found." });
    if (updated?.kind === "no_changes")
      return res
        .status(400)
        .send({ success: false, message: "No valid fields to update." });

    return res.send({
      success: true,
      message: "Visit updated successfully!",
      data: updated,
    });
  } catch (err) {
    console.error("Error updating visit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error updating visit." });
  }
};

exports.deleteVisit = async (req, res) => {
  try {
    const visitId = toInt(req.params.visitId);
    if (!visitId)
      return res
        .status(400)
        .send({ success: false, message: "Invalid visitId." });

    const result = await PropertyVisit.remove(visitId);
    if (result?.kind === "not_found")
      return res
        .status(404)
        .send({ success: false, message: "Visit not found." });

    return res.send({ success: true, message: "Visit deleted successfully!" });
  } catch (err) {
    console.error("Error deleting visit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Could not delete visit." });
  }
};

/* --------- REVISITS (Child) ---------- */

exports.createRevisit = async (req, res) => {
  try {
    const visit_id = toInt(req.params.visitId);

    const hasSplit = !!(req.body.revisit_date && req.body.revisit_time);
    const hasISO = !!req.body.revisit_datetime;

    if (!visit_id || (!hasSplit && !hasISO)) {
      return res.status(400).send({
        success: false,
        message:
          "visit_id (URL से) और (revisit_date+revisit_time) या revisit_datetime जरूरी है.",
      });
    }

    const created = await PropertyRevisit.create({
      ...req.body,
      visit_id,
      status: req.body.status || "scheduled",
      duration_minutes: req.body.duration_minutes || 60,
    });

    return res.status(201).send({
      success: true,
      message: "Revisit created successfully!",
      data: created,
    });
  } catch (err) {
    console.error("Error creating revisit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error creating revisit." });
  }
};

exports.getRevisitsByVisit = async (req, res) => {
  try {
    const visitId = toInt(req.params.visitId);
    if (!visitId)
      return res
        .status(400)
        .send({ success: false, message: "Invalid visitId." });

    // ✅ FIX: correct method name
    const rows = await PropertyRevisit.listByVisitId(visitId);

    return res.send({ success: true, data: rows });
  } catch (err) {
    console.error("Error listing revisits:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error listing revisits." });
  }
};

exports.updateRevisit = async (req, res) => {
  try {
    const revisitId = toInt(req.params.revisitId);
    if (!revisitId)
      return res
        .status(400)
        .send({ success: false, message: "Invalid revisitId." });

    const updated = await PropertyRevisit.updateById(revisitId, req.body);
    if (updated?.kind === "not_found")
      return res
        .status(404)
        .send({ success: false, message: "Revisit not found." });
    if (updated?.kind === "no_changes")
      return res
        .status(400)
        .send({ success: false, message: "No valid fields to update." });

    return res.send({
      success: true,
      message: "Revisit updated successfully!",
      data: updated,
    });
  } catch (err) {
    console.error("Error updating revisit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Error updating revisit." });
  }
};

exports.deleteRevisit = async (req, res) => {
  try {
    const revisitId = toInt(req.params.revisitId);
    if (!revisitId)
      return res
        .status(400)
        .send({ success: false, message: "Invalid revisitId." });

    const result = await PropertyRevisit.remove(revisitId);
    if (result?.kind === "not_found")
      return res
        .status(404)
        .send({ success: false, message: "Revisit not found." });

    return res.send({ success: true, message: "Revisit deleted successfully!" });
  } catch (err) {
    console.error("Error deleting revisit:", err);
    return res
      .status(500)
      .send({ success: false, message: err.message || "Could not delete revisit." });
  }
};
