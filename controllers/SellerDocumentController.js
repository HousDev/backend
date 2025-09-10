const Doc = require("../models/SellerDocumentModel");

const normalize = (b = {}) => ({
  seller_id: Number(b.seller_id) || null,
  doc_type: b.doc_type || null,
  doc_path: b.doc_path || null,
  status: b.status || null,
  doc_date: b.doc_date || null,     // 'YYYY-MM-DD'
  category: b.category || null,
});

const create = async (req, res) => {
  try {
    const data = normalize(req.body);
    if (!data.seller_id) return res.status(400).json({ success:false, message:"seller_id required" });
    const id = await Doc.create(data);
    res.status(201).json({ success:true, id });
  } catch (e) {
    console.error("Document create error:", e);
    res.status(500).json({ success:false, message:"Failed to create document" });
  }
};

const listBySeller = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!sellerId) return res.status(400).json({ success:false, message:"sellerId required" });
    const rows = await Doc.listBySeller(sellerId);
    res.json({ success:true, data: rows });
  } catch (e) {
    console.error("Document listBySeller error:", e);
    res.status(500).json({ success:false, message:"Failed to fetch documents" });
  }
};

const getById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await Doc.get(id);
    if (!row) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, data: row });
  } catch (e) {
    console.error("Document getById error:", e);
    res.status(500).json({ success:false, message:"Failed to fetch document" });
  }
};

const update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = normalize(req.body);
    const affected = await Doc.update(id, data);
    if (!affected) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, message:"Updated" });
  } catch (e) {
    console.error("Document update error:", e);
    res.status(500).json({ success:false, message:"Failed to update document" });
  }
};

const remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const affected = await Doc.remove(id);
    if (!affected) return res.status(404).json({ success:false, message:"Not found" });
    res.json({ success:true, message:"Deleted" });
  } catch (e) {
    console.error("Document delete error:", e);
    res.status(500).json({ success:false, message:"Failed to delete document" });
  }
};

module.exports = { create, listBySeller, getById, update, remove };
