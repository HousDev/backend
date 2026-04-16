const db = require("../config/database");

/*
  rss_sources table columns:
  id (BIGINT AI), name, url, category, description,
  active (tinyint), auto_publish (tinyint),
  sync_frequency enum('hourly','daily','weekly','manual'),
  content_filter enum('keywords','none'),
  keywords_json TEXT,
  last_sync DATETIME, total_posts INT, new_posts INT,
  created_at, updated_at
*/

const SELECT = `
  SELECT
    id, name, url, category, description,
    active, auto_publish AS autoPublish,
    sync_frequency AS syncFrequency,
    content_filter AS contentFilter,
    keywords_json AS keywordsJson,
    last_sync AS lastSync,
    total_posts AS totalPosts,
    new_posts AS newPosts,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM rss_sources
`;

function safeParseArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return String(text)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function rowToEntity(r) {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    category: r.category,
    description: r.description,
    active: !!r.active,
    autoPublish: !!r.autoPublish,
    syncFrequency: r.syncFrequency, // 'hourly'|'daily'|'weekly'|'manual'
    contentFilter: r.contentFilter, // 'keywords'|'none'
    keywords: r.keywordsJson ? safeParseArray(r.keywordsJson) : [],
    lastSync: r.lastSync ? new Date(r.lastSync).toISOString() : null,
    totalPosts: r.totalPosts || 0,
    newPosts: r.newPosts || 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function list() {
  const [rows] = await db.query(`${SELECT} ORDER BY created_at DESC`);
  return rows.map(rowToEntity);
}

async function getById(id) {
  const [rows] = await db.query(`${SELECT} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

async function create(payload) {
  const url =
    payload.url && !/^https?:\/\//i.test(payload.url)
      ? `https://${payload.url}`
      : payload.url;

  const keywordsJson =
    Array.isArray(payload.keywords) && payload.keywords.length
      ? JSON.stringify(payload.keywords)
      : null;

  const sql = `
    INSERT INTO rss_sources
      (name, url, category, description, active, auto_publish, sync_frequency,
       content_filter, keywords_json, last_sync, total_posts, new_posts)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    payload.name,
    url,
    payload.category || "Property News",
    payload.description || null,
    payload.active ? 1 : 0,
    payload.autoPublish ? 1 : 0,
    payload.syncFrequency || "daily",
    payload.contentFilter || "keywords",
    keywordsJson,
    null, // last_sync NULL on create
    payload.totalPosts || 0,
    payload.newPosts || 0,
  ];

  const [res] = await db.query(sql, params);
  return getById(res.insertId);
}

async function update(id, payload) {
  const current = await getById(id);
  if (!current) return null;

  const merged = { ...current, ...payload };

  const url =
    merged.url && !/^https?:\/\//i.test(merged.url)
      ? `https://${merged.url}`
      : merged.url;

  const keywordsJson =
    Array.isArray(merged.keywords) && merged.keywords.length
      ? JSON.stringify(merged.keywords)
      : null;

  const sql = `
    UPDATE rss_sources SET
      name = ?, url = ?, category = ?, description = ?, active = ?, auto_publish = ?,
      sync_frequency = ?, content_filter = ?, keywords_json = ?,
      last_sync = ?, total_posts = ?, new_posts = ?
    WHERE id = ?
  `;
  const params = [
    merged.name,
    url,
    merged.category,
    merged.description || null,
    merged.active ? 1 : 0,
    merged.autoPublish ? 1 : 0,
    merged.syncFrequency,
    merged.contentFilter,
    keywordsJson,
    merged.lastSync ? new Date(merged.lastSync) : null,
    merged.totalPosts || 0,
    merged.newPosts || 0,
    id,
  ];

  await db.query(sql, params);
  return getById(id);
}

async function toggleActive(id) {
  const src = await getById(id);
  if (!src) return null;
  await db.query(`UPDATE rss_sources SET active = ? WHERE id = ?`, [
    src.active ? 0 : 1,
    id,
  ]);
  return getById(id);
}

async function remove(id) {
  await db.query(`DELETE FROM rss_sources WHERE id = ?`, [id]);
  return true;
}

/* ---------- NEW: counters for scan/import ---------- */
// SCAN: update last_sync, set new_posts to scan result; total_posts unchanged
async function setScanCounts(id, { newCount = 0 }) {
  await db.query(
    `UPDATE rss_sources
       SET last_sync = UTC_TIMESTAMP(),
           new_posts = ?
     WHERE id = ?`,
    [Number(newCount) || 0, id]
  );
}

// IMPORT: update last_sync, add to total_posts, reduce/zero new_posts
async function bumpAfterImport(id, { insertedCount = 0 }) {
  const ins = Number(insertedCount) || 0;
  // reduce new_posts by insertedCount (not below 0), add to total_posts
  await db.query(
    `UPDATE rss_sources
       SET last_sync = UTC_TIMESTAMP(),
           total_posts = total_posts + ?,
           new_posts = GREATEST(new_posts - ?, 0)
     WHERE id = ?`,
    [ins, ins, id]
  );
}

/* existing: generic log (safe if table exists) */
async function logSync(
  id,
  { fetchedCount = 0, insertedCount = 0, errorText = null }
) {
  try {
    await db.query(
      `INSERT INTO rss_import_logs (source_id, fetched_count, inserted_count, error_text)
       VALUES (?, ?, ?, ?)`,
      [id, fetchedCount, insertedCount, errorText]
    );
  } catch (_) {}
}

module.exports = {
  list,
  getById,
  create,
  update,
  toggleActive,
  remove,
  // new helpers
  setScanCounts,
  bumpAfterImport,
  // logs
  logSync,
};
