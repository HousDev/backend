const Followup = require("../models/SellerFollowupModel");

const normalize = (b = {}) => ({
  seller_id: Number(b.seller_id) || null,
  followup_date: b.followup_date || null,  // 'YYYY-MM-DD'
  followup_type: b.followup_type || null,
  followup_time: b.followup_time || null,
  status: b.status || null,
  priority: b.priority || null,
  assigned_to: b.assigned_to || null,      // keep as string if you're storing names/emails
  reminder: !!b.reminder,
  notes: b.notes || null,
});

const create = async (req, res) => {
  try {
    const data = normalize(req.body);
    if (!data.seller_id) return res.status(400).json({ success:false, message:"seller_id required" });
    const id = await Followup.create(data);
    res.status(201).json({ success:true, id });
  } catch (e) {
    console.error("Followup create error:", e);
    res.status(500).json({ success:false, message:"Failed to create followup" });
  }
};

const listBySeller = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!sellerId) return res.status(400).json({ success:false, message:"sellerId required" });
    const rows = await Followup.listBySeller(sellerId);
    res.json({ success:true, data: rows });
  } catch (e) {
    console.error("Followup listBySeller error:", e);
    res.status(500).json({ success:false, message:"Failed to fetch followups" });
  }
};

const getById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await Followup.get(id);
    if (!row) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, data: row });
  } catch (e) {
    console.error("Followup getById error:", e);
    res.status(500).json({ success:false, message:"Failed to fetch followup" });
  }
};

const update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = normalize(req.body);
    const affected = await Followup.update(id, data);
    if (!affected) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, message:"Updated" });
  } catch (e) {
    console.error("Followup update error:", e);
    res.status(500).json({ success:false, message:"Failed to update followup" });
  }
};

const remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const affected = await Followup.remove(id);
    if (!affected) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, message:"Deleted" });
  } catch (e) {
    console.error("Followup delete error:", e);
    res.status(500).json({ success:false, message:"Failed to delete followup" });
  }
};

module.exports = { create, listBySeller, getById, update, remove };
