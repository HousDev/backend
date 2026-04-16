// controllers/heroBlock.controller.js
const Model = require("../models/heroBlock.model");

// helpers
const ok = (res, data) => res.json({ ok: true, data });
const bad = (res, msg, code = 400) =>
  res.status(code).json({ ok: false, error: msg });

const toId = (x) => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toPhotos = (v) => {
  // allow: array, JSON string, Buffer, null
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Buffer.isBuffer(v)) {
    try {
      const s = v.toString("utf8");
      const p = JSON.parse(s || "[]");
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v || "[]");
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof v === "object") return Array.isArray(v) ? v : [];
  return [];
};

// ------------ CREATE (multipart) ------------
exports.createMultipart = async (req, res) => {
  try {
    const { title, description = null } = req.body || {};
    if (!title || !String(title).trim()) return bad(res, "Title is required");

    const photos = (req.files || []).map((f) => ({
      url: f.publicUrl, // << use mapped public URL
      name: f.originalname,
      size: f.size,
    }));

    const created = await Model.create({
      title: String(title).trim(),
      description: description ?? null,
      photos,
    });
    return ok(res, created);
  } catch (e) {
    console.error("hero.createMultipart", e);
    return bad(res, "Failed to create hero block", 500);
  }
};

// ------------ CREATE (JSON) ------------
exports.createJson = async (req, res) => {
  try {
    const { title, description = null, photos } = req.body || {};
    if (!title || !String(title).trim()) return bad(res, "Title is required");

    const created = await Model.create({
      title: String(title).trim(),
      description: description ?? null,
      photos: toPhotos(photos),
    });

    return ok(res, created);
  } catch (e) {
    console.error("hero.createJson", e);
    return bad(res, "Failed to create hero block", 500);
  }
};

// ------------ LIST ------------
exports.list = async (_req, res) => {
  try {
    const items = await Model.list();
    return ok(res, items);
  } catch (e) {
    console.error("hero.list", e);
    return bad(res, "Failed to list hero blocks", 500);
  }
};

// ------------ GET ONE ------------
exports.get = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, "Invalid id");

    const one = await Model.getById(id);
    if (!one) return bad(res, "Not found", 404);

    return ok(res, one);
  } catch (e) {
    console.error("hero.get", e);
    return bad(res, "Failed to fetch hero block", 500);
  }
};

// ------------ UPDATE (multipart) ------------
exports.updateMultipart = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, "Invalid id");

    const { title, description } = req.body || {};

    // prefer "existingPhotos" (array/JSON) for already-saved images
    const existing = toPhotos(req.body.existingPhotos);
    // fallback: some clients may still send "photos" as existing JSON
    const bodyAsExisting = existing.length
      ? existing
      : toPhotos(req.body.photos);

    // new uploaded files
    const newFiles = (req.files || []).map((f) => ({
      url: f.publicUrl,
      name: f.originalname,
      size: f.size,
    }));

    const payload = {
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(description !== undefined
        ? { description: description ?? null }
        : {}),
      photos: [...bodyAsExisting, ...newFiles],
    };

    const updated = await Model.update(id, payload);
    if (!updated) return bad(res, "Not found", 404);
    return ok(res, updated);
  } catch (e) {
    console.error("hero.updateMultipart", e);
    return bad(res, "Failed to update hero block", 500);
  }
};

// ------------ UPDATE (JSON) ------------
exports.updateJson = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, "Invalid id");

    const patch = {};
    if ("title" in req.body) patch.title = String(req.body.title || "");
    if ("description" in req.body)
      patch.description = req.body.description ?? null;
    if ("photos" in req.body) patch.photos = toPhotos(req.body.photos);

    const updated = await Model.update(id, patch);
    if (!updated) return bad(res, "Not found", 404);
    return ok(res, updated);
  } catch (e) {
    console.error("hero.updateJson", e);
    return bad(res, "Failed to update hero block", 500);
  }
};

// ------------ HARD DELETE ------------
exports.remove = async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return bad(res, "Invalid id");

    const done = await Model.remove(id);
    if (!done) return bad(res, "Not found", 404);

    return ok(res, { id, deleted: true });
  } catch (e) {
    console.error("hero.remove", e);
    return bad(res, "Failed to delete hero block", 500);
  }
};

// ------------ UPLOAD ONLY ------------
exports.uploadPhotos = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return bad(res, "No files uploaded");

    const out = files.map((f) => ({
      url: f.publicUrl,
      name: f.originalname,
      size: f.size,
    }));
    return ok(res, out);
  } catch (e) {
    console.error("hero.uploadPhotos", e);
    return bad(res, "Upload failed", 500);
  }
};
