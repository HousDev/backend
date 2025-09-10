const Activity = require("../models/SellerActivityModel");

const normalize = (b = {}) => ({
  seller_id: Number(b.seller_id) || null,
  activity_type: b.activity_type || null,
  description: b.description || null,
  activity_date: b.activity_date || null, // 'YYYY-MM-DD'
  activity_time: b.activity_time || null,
  stage: b.stage || null,
  duration: b.duration || null,
  outcome: b.outcome || null,
  next_action: b.next_action || null,
  executed_by: b.executed_by || null,
  remarks: b.remarks || null,
});

const create = async (req, res) => {
  try {
    const data = normalize(req.body);
    if (!data.seller_id) return res.status(400).json({ success:false, message:"seller_id required" });
    const id = await Activity.create(data);
    res.status(201).json({ success:true, id });
  } catch (e) {
    console.error("Activity create error:", e);
    res.status(500).json({ success:false, message:"Failed to create activity" });
  }
};

const listBySeller = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!sellerId) return res.status(400).json({ success:false, message:"sellerId required" });
    const rows = await Activity.listBySeller(sellerId);
    res.json({ success:true, data: rows });
  } catch (e) {
    console.error("Activity listBySeller error:", e);
    res.status(500).json({ success:false, message:"Failed to fetch activities" });
  }
};

const getById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await Activity.get(id);
    if (!row) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, data: row });
  } catch (e) {
    console.error("Activity getById error:", e);
    res.status(500).json({ success:false, message:"Failed to fetch activity" });
  }
};

const update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = normalize(req.body);
    const affected = await Activity.update(id, data);
    if (!affected) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, message:"Updated" });
  } catch (e) {
    console.error("Activity update error:", e);
    res.status(500).json({ success:false, message:"Failed to update activity" });
  }
};

const remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const affected = await Activity.remove(id);
    if (!affected) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, message:"Deleted" });
  } catch (e) {
    console.error("Activity delete error:", e);
    res.status(500).json({ success:false, message:"Failed to delete activity" });
  }
};

module.exports = { create, listBySeller, getById, update, remove };
