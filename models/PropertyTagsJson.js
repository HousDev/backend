// models/PropertyTagsJson.js
const db = require("../config/database");

/* helpers */
function norm(arr) {
  const a = Array.isArray(arr) ? arr : [];
  const m = new Map();
  for (const raw of a) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!m.has(k)) m.set(k, t);
  }
  return Array.from(m.values());
}

/* queries */
async function getAll() {
  const [rows] = await db.execute(
    `SELECT property_id, tags, created_at, updated_at FROM property_tags_json ORDER BY property_id DESC`
  );
  return rows.map(r => ({
    property_id: r.property_id,
    tags: Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || "[]"),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

async function get(propertyId) {
  const [rows] = await db.execute(
    `SELECT property_id, tags, created_at, updated_at FROM property_tags_json WHERE property_id = ?`,
    [propertyId]
  );
  if (!rows.length) return { property_id: Number(propertyId), tags: [], created_at: null, updated_at: null };
  const r = rows[0];
  return {
    property_id: r.property_id,
    tags: Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || "[]"),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function replace(propertyId, tags, user = null) {
  const clean = norm(tags);
  await db.execute(
    `INSERT INTO property_tags_json (property_id, tags, created_by, updated_by)
     VALUES (?, CAST(? AS JSON), ?, ?)
     ON DUPLICATE KEY UPDATE tags = VALUES(tags), updated_by = VALUES(updated_by)`,
    [propertyId, JSON.stringify(clean), user, user]
  );
  return get(propertyId);
}

async function add(propertyId, tags, user = null) {
  const cur = await get(propertyId);
  const merged = norm([...(cur.tags || []), ...(tags || [])]);
  return replace(propertyId, merged, user);
}

async function remove(propertyId, tags, user = null) {
  const rm = new Set(norm(tags).map(t => t.toLowerCase()));
  const cur = await get(propertyId);
  const remain = (cur.tags || []).filter(t => !rm.has(String(t).toLowerCase()));
  return replace(propertyId, remain, user);
}

async function deleteRow(propertyId) {
  await db.execute(`DELETE FROM property_tags_json WHERE property_id = ?`, [propertyId]);
  return { ok: true };
}

async function listKnown(limit = 5000) {
  const [rows] = await db.execute(`SELECT tags FROM property_tags_json LIMIT ?`, [Number(limit)]);
  const uniq = new Map();
  for (const r of rows) {
    const arr = Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || "[]");
    for (const t of arr) {
      const k = String(t).toLowerCase();
      if (!uniq.has(k)) uniq.set(k, String(t));
    }
  }
  return Array.from(uniq.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function deleteTagEverywhere(tag) {
  const t = String(tag || "").trim();
  if (!t) return { changed: 0 };
  const [rows] = await db.execute(`SELECT property_id, tags FROM property_tags_json`);
  let changed = 0;
  for (const r of rows) {
    const arr = Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || "[]");
    const next = arr.filter(x => x.toLowerCase() !== t.toLowerCase());
    if (next.length !== arr.length) {
      await db.execute(
        `UPDATE property_tags_json SET tags = CAST(? AS JSON) WHERE property_id = ?`,
        [JSON.stringify(next), r.property_id]
      );
      changed++;
    }
  }
  return { changed };
}

module.exports = {
  getAll,
  get,
  replace,
  add,
  remove,
  deleteRow,
  listKnown,
  deleteTagEverywhere,
};
