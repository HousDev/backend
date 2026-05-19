// controllers/templateController.js

const Template = require("../models/templateModel");

const CONTENT_LIMITS = { sms: 1000, whatsapp: 2000, email: 5000 };
const CHANNELS = ["sms", "whatsapp", "email"];
const PRIORITIES = ["Normal", "High", "Critical"];
const STATUSES = ["pending", "approved", "rejected"];

// Toggle this if you want to allow ANY category string
const ALLOW_ANY_CATEGORY = true;

// Optional: whitelist categories
const MASTER_CATEGORIES = new Set([
  "Alerts", "Billing", "Marketing", "Notification", 
  "Reminders", "Security", "Welcome",
]);

function validate(body) {
  const errors = [];

  const name = (body.name || "").trim();
  if (!name) errors.push("Name is required.");
  if (name.length > 150) errors.push("Name too long (max 150).");

  const channel = (body.channel || "sms").trim();
  if (!CHANNELS.includes(channel)) errors.push("Invalid channel.");

  const category = (body.category || "").trim();
  if (!category) errors.push("Category is required.");
  if (!ALLOW_ANY_CATEGORY && !MASTER_CATEGORIES.has(category)) {
    errors.push("Invalid category.");
  }

  const limit = CONTENT_LIMITS[channel];
  const content = (body.content || "").toString();
  if (!content) errors.push("Content is required.");
  if (content.length > limit) {
    errors.push(`Content exceeds limit for ${channel} (${limit}).`);
  }

  const priority = (body.priority || "Normal").trim();
  if (!PRIORITIES.includes(priority)) errors.push("Invalid priority.");

  const autoApprove = !!body.autoApprove;

  let status = (body.status || "pending").trim();
  if (!STATUSES.includes(status)) errors.push("Invalid status.");
  if (autoApprove) status = "approved";

  // ✅ NEW: Add is_active validation
   let is_active = body.is_active;
  if (is_active === undefined || is_active === null) {
    is_active = 1;
  } else {
    is_active = (is_active === true || is_active === 1 || is_active === "1") ? 1 : 0;
  }

  // ✅ ADD THIS - Handle rejection_reason
  const rejection_reason = body.rejection_reason || null;

  return {
    ok: errors.length === 0,
    errors,
    value: { 
      name, 
      category, 
      content, 
      priority, 
      autoApprove, 
      status, 
      channel,
      is_active,      // ✅ ADD THIS
      rejection_reason // ✅ ADD THIS
    },
  };
}

async function create(req, res) {
  const { ok, errors, value } = validate(req.body);
  if (!ok) return res.status(400).json({ errors });
  try {
    const tpl = await Template.createTemplate(value);
    return res.status(201).json(tpl);
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ errors: ["Duplicate detected."] });
    }
    console.error("Create template error:", err);
    return res.status(500).json({ errors: ["Server error"] });
  }
}

async function getOne(req, res) {
  const tpl = await Template.getById(req.params.id);
  if (!tpl) return res.status(404).json({ errors: ["Not found"] });
  res.json(tpl);
}

function toInt(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

async function list(req, res) {
  const limit = toInt(req.query.limit, 20);
  const offset = toInt(req.query.offset, 0);

  const result = await Template.list({
    q: req.query.q,
    channel: req.query.channel,
    status: req.query.status,
    category: req.query.category,
    limit,
    offset,
  });
  res.json(result);
}

async function update(req, res) {
  const existing = await Template.getById(req.params.id);
  if (!existing) return res.status(404).json({ errors: ["Not found"] });

  const { ok, errors, value } = validate(req.body);
  if (!ok) return res.status(400).json({ errors });

  try {
    const updated = await Template.updateTemplate(req.params.id, value);
    res.json(updated);
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ errors: ["Duplicate detected."] });
    }
    console.error("Update template error:", err);
    res.status(500).json({ errors: ["Server error"] });
  }
}

async function remove(req, res) {
  const ok = await Template.deleteTemplate(req.params.id);
  if (!ok) return res.status(404).json({ errors: ["Not found"] });
  res.json({ success: true });
}

module.exports = { create, getOne, list, update, remove };