
// models/blogViews.model.js
const db = require("../config/database");

async function hasRecentView(postId, sessionId, minutes = 1440) {
  try {
    const cutoffDate = new Date(Date.now() - Number(minutes) * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');

    const sql = `
      SELECT 1 FROM blog_post_events
      WHERE post_id = ?
        AND event_type = 'view'
        AND created_at >= ?
        AND session_id = ?
      LIMIT 1
    `;
    const [rows] = await db.execute(sql, [postId, cutoffStr, sessionId]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    return false; // fail-open
  }
}

async function recordView({ post_id, session_id, ip, user_agent, minutes_window = 1440 }) {
  try {
    const recent = await hasRecentView(post_id, session_id, minutes_window);
    if (recent) return { inserted: false, deduped: true };

    const sql = `
      INSERT INTO blog_post_events (post_id, event_type, session_id, ip, user_agent, created_at)
      VALUES (?, 'view', ?, ?, ?, NOW())
    `;
    await db.execute(sql, [post_id, session_id, ip, user_agent]);
    return { inserted: true };
  } catch (err) {
    return { inserted: false, error: err.message };
  }
}

async function getPostViews(postId) {
  const sql = `
    SELECT COUNT(*) AS total_views,
           COUNT(DISTINCT session_id) AS unique_views
    FROM blog_post_events
    WHERE post_id = ? AND event_type = 'view'
  `;
  const [rows] = await db.execute(sql, [postId]);
  return {
    total_views: Number(rows?.[0]?.total_views) || 0,
    unique_views: Number(rows?.[0]?.unique_views) || 0,
  };
}
async function hasLiked(postId, sessionId) {
  try {
    const sql = `
      SELECT id FROM blog_post_events
      WHERE post_id = ? AND event_type = 'like' AND session_id = ?
      LIMIT 1
    `;
    const [rows] = await db.execute(sql, [postId, sessionId]);
    return Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch (err) {
    return null;
  }
}

async function toggleLike({ post_id, session_id, ip, user_agent }) {
  try {
    const existingId = await hasLiked(post_id, session_id);

    if (existingId) {
      await db.execute(`DELETE FROM blog_post_events WHERE id = ?`, [existingId]);
      return { liked: false };
    } else {
      const sql = `
        INSERT INTO blog_post_events (post_id, event_type, session_id, ip, user_agent, created_at)
        VALUES (?, 'like', ?, ?, ?, NOW())
      `;
      await db.execute(sql, [post_id, session_id, ip, user_agent]);
      return { liked: true };
    }
  } catch (err) {
    return { liked: false, error: err.message };
  }
}

module.exports = { hasRecentView, recordView, getPostViews, hasLiked, toggleLike };