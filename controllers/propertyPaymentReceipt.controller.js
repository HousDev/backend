// controllers/propertyPaymentReceipt.controller.js
const ReceiptModel = require('../models/propertyPaymentReceipt.model');

// helpers
function safeNumber(v, def = null) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function safeJson(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (_) { return v; }
}

// POST / (create)
exports.create = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.updated_by || null;

    // Optional: if client forces custom receipt_id, soft-check duplicate
    if (req.body.receipt_id) {
      const exists = await ReceiptModel.getByReceiptId(req.body.receipt_id);
      if (exists) {
        return res.status(409).json({ success: false, message: 'Duplicate receipt_id' });
      }
    }

    const data = {
      // identity
      receipt_id: req.body.receipt_id, // auto if missing
      type: req.body.type,

      // statuses
      status: req.body.status,
      payment_status: req.body.payment_status,
      related_party: req.body.related_party,

      // parties
      seller_id: req.body.seller_id,
      seller_name: req.body.seller_name,
      seller_phone: req.body.seller_phone,
      seller_email: req.body.seller_email,

      buyer_id: req.body.buyer_id,
      buyer_name: req.body.buyer_name,
      buyer_phone: req.body.buyer_phone,
      buyer_email: req.body.buyer_email,

      // property
      property_id: req.body.property_id,
      property_address: req.body.property_address,
      property_details: safeJson(req.body.property_details),

      // money
      deal_value: safeNumber(req.body.deal_value),
      payment_type: req.body.payment_type,
      amount: safeNumber(req.body.amount),
      amount_in_words: req.body.amount_in_words,

      // dates & references
      receipt_date: req.body.receipt_date || null,  // YYYY-MM-DD
      payment_date: req.body.payment_date || null,  // YYYY-MM-DD
      payment_reference: req.body.payment_reference,

      // misc
      transaction_details: safeJson(req.body.transaction_details),
      notes: req.body.notes,

      // ledger
      ledger_entries: safeJson(req.body.ledger_entries),

      // audit
      created_by: req.body.created_by,
      updated_by: req.body.updated_by,
    };

    if (data.amount != null && data.amount < 0) {
      return res.status(400).json({ success: false, message: 'amount must be >= 0' });
    }

    const created = await ReceiptModel.createReceipt(data, userId);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('create receipt error:', err);
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Duplicate receipt_id' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: String(err?.message || err) });
  }
};

// GET /id/:id
exports.getById = async (req, res) => {
  try {
    const item = await ReceiptModel.getById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('getById error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /rid/:receipt_id
exports.getByReceiptId = async (req, res) => {
  try {
    const item = await ReceiptModel.getByReceiptId(req.params.receipt_id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('getByReceiptId error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET / (list with filters/pagination)
exports.list = async (req, res) => {
  try {
    const {
      page, limit, sortBy, sortDir, q,
      status, payment_status, payment_type,
      seller_id, buyer_id, property_id,
      from_date, to_date,
    } = req.query;

    const data = await ReceiptModel.listReceipts({
      page, limit, sortBy, sortDir, q,
      status, payment_status, payment_type,
      seller_id, buyer_id, property_id,
      from_date, to_date,
    });

    res.json({ success: true, ...data });
  } catch (err) {
    console.error('list error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /all (no pagination)
exports.getAll = async (_req, res) => {
  try {
    const items = await ReceiptModel.getAllReceipts();
    res.json({ success: true, total: items.length, items });
  } catch (err) {
    console.error('getAll error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /:id
exports.update = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.updated_by || null;
    const id = req.params.id;

    const data = {
      type: req.body.type,
      status: req.body.status,
      payment_status: req.body.payment_status,
      related_party: req.body.related_party,

      seller_id: req.body.seller_id,
      seller_name: req.body.seller_name,
      seller_phone: req.body.seller_phone,
      seller_email: req.body.seller_email,

      buyer_id: req.body.buyer_id,
      buyer_name: req.body.buyer_name,
      buyer_phone: req.body.buyer_phone,
      buyer_email: req.body.buyer_email,

      property_id: req.body.property_id,
      property_address: req.body.property_address,
      property_details: safeJson(req.body.property_details),

      deal_value: safeNumber(req.body.deal_value),
      payment_type: req.body.payment_type,
      amount: safeNumber(req.body.amount),
      amount_in_words: req.body.amount_in_words,

      receipt_date: req.body.receipt_date || null,
      payment_date: req.body.payment_date || null,
      payment_reference: req.body.payment_reference,

      transaction_details: safeJson(req.body.transaction_details),
      notes: req.body.notes,
      ledger_entries: safeJson(req.body.ledger_entries),

      updated_by: userId,
    };

    if (data.amount != null && data.amount < 0) {
      return res.status(400).json({ success: false, message: 'amount must be >= 0' });
    }

    const updated = await ReceiptModel.updateReceipt(id, data, userId);
    if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('update error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE /:id
exports.remove = async (req, res) => {
  try {
    const ok = await ReceiptModel.deleteReceipt(req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error('delete error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
