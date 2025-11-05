// src/controllers/propertyVisitsController.js
const PropertyVisit = require("../models/PropertyVisit");
const PropertyRevisit = require("../models/PropertyRevisit");

/* --------- VISITS (Parent) ---------- */

exports.createVisit = async (req, res) => {
  try {
    const { buyer_id, property_id, visit_datetime } = req.body;
    if (!buyer_id || !property_id || !visit_datetime) {
      return res.status(400).send({
        success: false,
        message: "buyer_id, property_id and visit_datetime are required!",
      });
    }

    const created = await PropertyVisit.create({
      ...req.body,
      status: req.body.status || "scheduled",
      duration_minutes: req.body.duration_minutes || 60,
      visit_type: req.body.visit_type || "site_visit",
      seller_present: req.body.seller_present ? 1 : 0,
    });

    res.status(201).send({
      success: true,
      message: "Visit created successfully!",
      data: created,
    });
  } catch (err) {
    console.error("Error creating visit:", err);
    res.status(500).send({ success: false, message: err.message || "Error creating visit." });
  }
};

exports.getAllVisits = async (req, res) => {
  try {
    const {
      buyer_id, seller_id, property_id, executive_id, status,
      search, from_datetime, to_datetime, page = 1, limit = 20,
    } = req.query;

    const { rows, total } = await PropertyVisit.getAll(
      { buyer_id, seller_id, property_id, executive_id, status, search, from_datetime, to_datetime },
      { page, limit }
    );

    res.send({
      success: true,
      data: rows,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.max(1, Math.ceil(total / Number(limit))),
      },
    });
  } catch (err) {
    console.error("Error fetching visits:", err);
    res.status(500).send({ success: false, message: err.message || "Error fetching visits." });
  }
};

exports.getVisitById = async (req, res) => {
  try {
    const data = await PropertyVisit.findWithRevisits(req.params.visitId);
    if (!data) return res.status(404).send({ success: false, message: "Visit not found." });
    res.send({ success: true, data });
  } catch (err) {
    console.error("Error retrieving visit:", err);
    res.status(500).send({ success: false, message: err.message || "Error retrieving visit." });
  }
};

exports.updateVisit = async (req, res) => {
  try {
    const updated = await PropertyVisit.updateById(req.params.visitId, req.body);
    if (updated?.kind === "not_found")  return res.status(404).send({ success: false, message: "Visit not found." });
    if (updated?.kind === "no_changes") return res.status(400).send({ success: false, message: "No valid fields to update." });

    res.send({ success: true, message: "Visit updated successfully!", data: updated });
  } catch (err) {
    console.error("Error updating visit:", err);
    res.status(500).send({ success: false, message: err.message || "Error updating visit." });
  }
};

exports.deleteVisit = async (req, res) => {
  try {
    const result = await PropertyVisit.remove(req.params.visitId);
    if (result?.kind === "not_found") return res.status(404).send({ success: false, message: "Visit not found." });
    res.send({ success: true, message: "Visit deleted successfully!" });
  } catch (err) {
    console.error("Error deleting visit:", err);
    res.status(500).send({ success: false, message: err.message || "Could not delete visit." });
  }
};

/* --------- REVISITS (Child) ---------- */

exports.createRevisit = async (req, res) => {
  try {
    const visit_id = parseInt(req.params.visitId, 10);
    const { revisit_datetime } = req.body;

    if (!visit_id || !revisit_datetime) {
      return res.status(400).send({
        success: false,
        message: "visit_id (from URL) and revisit_datetime are required!",
      });
    }

    const created = await PropertyRevisit.create({
      ...req.body,
      visit_id,
      status: req.body.status || "scheduled",
      duration_minutes: req.body.duration_minutes || 60,
    });

    res.status(201).send({
      success: true,
      message: "Revisit created successfully!",
      data: created,
    });
  } catch (err) {
    console.error("Error creating revisit:", err);
    res.status(500).send({ success: false, message: err.message || "Error creating revisit." });
  }
};

exports.getRevisitsByVisit = async (req, res) => {
  try {
    const rows = await PropertyRevisit.listByVisit(parseInt(req.params.visitId, 10));
    res.send({ success: true, data: rows });
  } catch (err) {
    console.error("Error listing revisits:", err);
    res.status(500).send({ success: false, message: err.message || "Error listing revisits." });
  }
};

exports.updateRevisit = async (req, res) => {
  try {
    const updated = await PropertyRevisit.updateById(req.params.revisitId, req.body);
    if (updated?.kind === "not_found")  return res.status(404).send({ success: false, message: "Revisit not found." });
    if (updated?.kind === "no_changes") return res.status(400).send({ success: false, message: "No valid fields to update." });

    res.send({ success: true, message: "Revisit updated successfully!", data: updated });
  } catch (err) {
    console.error("Error updating revisit:", err);
    res.status(500).send({ success: false, message: err.message || "Error updating revisit." });
  }
};

exports.deleteRevisit = async (req, res) => {
  try {
    const result = await PropertyRevisit.remove(req.params.revisitId);
    if (result?.kind === "not_found") return res.status(404).send({ success: false, message: "Revisit not found." });
    res.send({ success: true, message: "Revisit deleted successfully!" });
  } catch (err) {
    console.error("Error deleting revisit:", err);
    res.status(500).send({ success: false, message: err.message || "Could not delete revisit." });
  }
};
