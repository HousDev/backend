// models/views.model.js
const db = require("../config/database");

/**
 * Canonical event_type for page views
 */
const VIEWS_EVENT = "view";

/**
 * Returns { total_views, unique_views }
 */
async function getTotalViews() {
  const sql = `
    SELECT 
      COUNT(*) AS total_views,
      COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS unique_views
    FROM property_events
    WHERE event_type = ?
  `;
  const [rows] = await db.execute(sql, [VIEWS_EVENT]);

  if (!rows || rows.length === 0) {
    return { total_views: 0, unique_views: 0 };
  }

  return {
    total_views: Number(rows[0].total_views) || 0,
    unique_views: Number(rows[0].unique_views) || 0,
  };
}

/**
 * Returns { total_views, unique_views } for a specific property
 */
async function getPropertyViews(propertyId) {
  const sql = `
    SELECT
      COUNT(*) AS total_views,
      COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS unique_views
    FROM property_events
    WHERE event_type = ? AND property_id = ?
  `;
  const [rows] = await db.execute(sql, [VIEWS_EVENT, propertyId]);

  if (!rows || rows.length === 0) {
    return { total_views: 0, unique_views: 0 };
  }

  return {
    total_views: Number(rows[0].total_views) || 0,
    unique_views: Number(rows[0].unique_views) || 0,
  };
}

/**
 * Returns only unique_views (backwards compatible)
 */
async function getPropertyUniqueViews(propertyId) {
  const sql = `
    SELECT COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS unique_views
    FROM property_events
    WHERE event_type = ? AND property_id = ?
  `;
  const [rows] = await db.execute(sql, [VIEWS_EVENT, propertyId]);
  return rows && rows[0] ? Number(rows[0].unique_views) || 0 : 0;
}

/**
 * top/bottom views
 */
async function getTopViews({ limit = 10, unique = false }) {
  limit = Number(limit) || 10;
  if (unique) {
    const sql = `
      SELECT property_id, slug, COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS views
      FROM property_events
      WHERE event_type = ?
      GROUP BY property_id, slug
      ORDER BY views DESC
      LIMIT ?
    `;
    const [rows] = await db.execute(sql, [VIEWS_EVENT, limit]);
    return rows;
  } else {
    const sql = `
      SELECT property_id, slug, COUNT(*) AS views
      FROM property_events
      WHERE event_type = ?
      GROUP BY property_id, slug
      ORDER BY views DESC
      LIMIT ?
    `;
    const [rows] = await db.execute(sql, [VIEWS_EVENT, limit]);
    return rows;
  }
}

async function getBottomViews({ limit = 10, unique = false }) {
  limit = Number(limit) || 10;
  if (unique) {
    const sql = `
      SELECT property_id, slug, COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS views
      FROM property_events
      WHERE event_type = ?
      GROUP BY property_id, slug
      ORDER BY views ASC
      LIMIT ?
    `;
    const [rows] = await db.execute(sql, [VIEWS_EVENT, limit]);
    return rows;
  } else {
    const sql = `
      SELECT property_id, slug, COUNT(*) AS views
      FROM property_events
      WHERE event_type = ?
      GROUP BY property_id, slug
      ORDER BY views ASC
      LIMIT ?
    `;
    const [rows] = await db.execute(sql, [VIEWS_EVENT, limit]);
    return rows;
  }
}

/**
 * hasRecentView:
 * - propertyId: numeric
 * - sessionId: string|null
 * - dedupeKey: string|null
 * - minutes: number (window)
 * - ip, userAgent: optional fallbacks
 *
 * Returns true if a matching view exists within the window.
 *
 * NOTE: using JS to compute cutoff to avoid INTERVAL parameter issues.
 */
async function hasRecentView(propertyId, sessionId, dedupeKey, minutes = 1, ip = null, userAgent = null) {
  try {
    const cutoffDate = new Date(Date.now() - Number(minutes || 1) * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');

  

    // Priority logic:
    // 1. If sessionId exists, check for same session + property (most important)
    // 2. If dedupeKey exists, check for same dedupe_key + property
    // 3. Fallback to IP + user_agent (least reliable)
    const sql = `
      SELECT 1
      FROM property_events
      WHERE property_id = ?
        AND event_type = 'view'
        AND created_at >= ?
        AND (
          (session_id IS NOT NULL AND session_id = ?)
          OR (dedupe_key IS NOT NULL AND dedupe_key = ?)
          OR (session_id IS NULL AND dedupe_key IS NULL AND ip IS NOT NULL AND ip = ? AND user_agent IS NOT NULL AND user_agent = ?)
        )
      LIMIT 1
    `;

    const params = [propertyId, cutoffStr, sessionId, dedupeKey, ip, userAgent];
    const [rows] = await db.execute(sql, params);

    const found = Array.isArray(rows) && rows.length > 0;
    return found;
  } catch (err) {
    // fail-open so that analytics DB issues don't break page loads
    return false;
  }
}

async function recordView(payload = {}) {
  const {
    property_id: propertyId = null,
    slug = null,
    dedupe_key: dedupeKey = null,
    session_id: sessionId = null,
    ip = null,
    user_agent: userAgent = null,
    path = null,
    referrer = null,
    source = null,
    minutes_window = 1,
    event_type = VIEWS_EVENT,
    // allow callers to send a `payload` object with extra fields
    payload: extraPayload = null,
  } = payload;

  try {
    // Normalize dedupeKey: treat string "null"/"undefined"/"" as null
    let dedupeKeyNorm = dedupeKey;
    if (typeof dedupeKeyNorm === "string") {
      const t = dedupeKeyNorm.trim().toLowerCase();
      if (t === "null" || t === "undefined" || t === "") dedupeKeyNorm = null;
    }

    // If propertyId provided, check recent view to avoid duplicate inserts
    if (propertyId) {
      const recent = await hasRecentView(propertyId, sessionId, dedupeKeyNorm, Number(minutes_window || 1), ip, userAgent);
      if (recent) {
        return { inserted: false, meta: { deduped: true } };
      }
    }

    // Consolidate a JSON payload to store in the `payload` column (keeps DB schema stable)
    const storedPayload = Object.assign(
      {},
      typeof extraPayload === "object" && extraPayload !== null ? extraPayload : {},
      // include some top-level fields if present so we don't need extra columns
      path ? { path } : {},
      source ? { source } : {},
      // keep original incoming small fields for debugging/analysis
      slug ? { slug } : {},
      event_type ? { event_type } : {}
    );

    // Insert using columns that exist in your table (payload is JSON/text)
    const sql = `
      INSERT INTO property_events
        (property_id, slug, event_type, payload, ip, user_agent, referrer, session_id, dedupe_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const params = [
      propertyId,
      slug,
      event_type,
      JSON.stringify(storedPayload), // store JSON string in payload column
      ip,
      userAgent,
      referrer,
      sessionId,
      dedupeKeyNorm
    ];

    const [result] = await db.execute(sql, params);

    // Optionally return totals for convenience
    let meta = { insertedId: result.insertId || null };
    if (propertyId) {
      try {
        const totals = await getPropertyViews(propertyId);
        meta = { ...meta, totals };
      } catch (totErr) {
        // don't fail because of totals fetch — just log
      }
    }

    return { inserted: true, meta };
  } catch (err) {
    return { inserted: false, error: err && err.message ? err.message : String(err) };
  }
}
async function getAllViews({ unique = false } = {}) {
  const sql = unique
    ? `
        SELECT 
          property_id,
          slug,
          COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS unique_views,
          COUNT(*) AS total_views
        FROM property_events
        WHERE event_type = ?
        GROUP BY property_id, slug
        ORDER BY total_views DESC;
      `
    : `
        SELECT 
          property_id,
          slug,
          COUNT(*) AS total_views,
          COUNT(DISTINCT COALESCE(session_id, dedupe_key)) AS unique_views
        FROM property_events
        WHERE event_type = ?
        GROUP BY property_id, slug
        ORDER BY total_views DESC;
      `;

  const [rows] = await db.execute(sql, [VIEWS_EVENT]);
  return rows;
}


module.exports = {
  getTotalViews,
  getPropertyViews,
  getPropertyUniqueViews,
  getTopViews,
  getBottomViews,
  hasRecentView,
  recordView,
  getAllViews,
};
