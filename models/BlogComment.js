// // models/BlogComment.js
// const db = require("../config/database"); // mysql2/promise pool

// class BlogComment {
//   static async listBySlug(
//     slug,
//     { status = "approved", limit = 100, offset = 0 } = {}
//   ) {
//     const [rows] = await db.query(
//       `SELECT id, post_id AS postId, post_slug AS postSlug, author, email, content, status, created_at AS createdAt
//        FROM blog_comments
//        WHERE post_slug = ? AND status = ?
//        ORDER BY created_at DESC
//        LIMIT ? OFFSET ?`,
//       [slug, status, Number(limit), Number(offset)]
//     );
//     return rows;
//   }

//   static async createForSlug(
//     slug,
//     {
//       author,
//       email,
//       content,
//       status = "approved",
//       postId = null,
//       ip = null,
//       ua = null,
//     }
//   ) {
//     const [res] = await db.query(
//       `INSERT INTO blog_comments (post_id, post_slug, author, email, content, status, ip_address, user_agent)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//       [postId, slug, author || null, email || null, content, status, ip, ua]
//     );
//     return { id: res.insertId };
//   }

//   static async countForSlug(slug, { status = "approved" } = {}) {
//     const [rows] = await db.query(
//       `SELECT COUNT(*) AS cnt FROM blog_comments WHERE post_slug = ? AND status = ?`,
//       [slug, status]
//     );
//     return rows?.[0]?.cnt ?? 0;
//   }
// }

// module.exports = BlogComment;

// models/BlogComment.js
const db = require("../config/database"); // mysql2/promise pool

class BlogComment {
  /* ----------------------------- Public list ----------------------------- */
  static async listBySlug(
    slug,
    { status = "approved", limit = 100, offset = 0 } = {}
  ) {
    const [rows] = await db.query(
      `SELECT id,
              post_id       AS postId,
              post_slug     AS postSlug,
              author,
              email,
              content,
              status,
              created_at    AS createdAt
       FROM blog_comments
       WHERE post_slug = ? AND status = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [slug, status, Number(limit), Number(offset)]
    );
    return rows;
  }

  static async createForSlug(
    slug,
    {
      author,
      email,
      content,
      status = "approved",
      postId = null,
      ip = null,
      ua = null,
    }
  ) {
    const [res] = await db.query(
      `INSERT INTO blog_comments
        (post_id, post_slug, author, email, content, status, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [postId, slug, author || null, email || null, content, status, ip, ua]
    );
    return { id: res.insertId };
  }

  static async countForSlug(slug, { status = "approved" } = {}) {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM blog_comments
       WHERE post_slug = ? AND status = ?`,
      [slug, status]
    );
    return rows?.[0]?.cnt ?? 0;
  }

  /* -------------------------- Admin / Moderation ------------------------- */

  static async adminList({ slug = null, status = null, q = null, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];

    if (slug) {
      where.push("post_slug = ?");
      params.push(slug);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (q) {
      where.push("(author LIKE ? OR email LIKE ? OR content LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await db.query(
      `SELECT id,
              post_id       AS postId,
              post_slug     AS postSlug,
              author,
              email,
              content,
              status,
              ip_address    AS ipAddress,
              user_agent    AS userAgent,
              created_at    AS createdAt,
              updated_at    AS updatedAt
       FROM blog_comments
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    return rows;
  }

  static async adminCount({ slug = null, status = null, q = null } = {}) {
    const where = [];
    const params = [];

    if (slug) {
      where.push("post_slug = ?");
      params.push(slug);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (q) {
      where.push("(author LIKE ? OR email LIKE ? OR content LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM blog_comments
       ${whereSql}`,
      params
    );
    return rows?.[0]?.cnt ?? 0;
  }

  static async getById(id) {
    const [rows] = await db.query(
      `SELECT id,
              post_id       AS postId,
              post_slug     AS postSlug,
              author,
              email,
              content,
              status,
              ip_address    AS ipAddress,
              user_agent    AS userAgent,
              created_at    AS createdAt,
              updated_at    AS updatedAt
       FROM blog_comments
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] ?? null;
  }

  static async updateById(id, { author, email, content, status } = {}) {
    // Build dynamic SET
    const fields = [];
    const params = [];

    if (author !== undefined) {
      fields.push("author = ?");
      params.push(author || null);
    }
    if (email !== undefined) {
      fields.push("email = ?");
      params.push(email || null);
    }
    if (content !== undefined) {
      fields.push("content = ?");
      params.push(content || null);
    }
    if (status !== undefined) {
      fields.push("status = ?");
      params.push(status);
    }

    if (!fields.length) return 0;

    fields.push("updated_at = CURRENT_TIMESTAMP");

    const [res] = await db.query(
      `UPDATE blog_comments
       SET ${fields.join(", ")}
       WHERE id = ?`,
      [...params, id]
    );
    return res.affectedRows > 0 ? 1 : 0;
  }
  static async deleteById(id) {
    const [res] = await db.query(
      `DELETE FROM blog_comments WHERE id = ?`,
      [id]
    );
    return res.affectedRows > 0 ? 1 : 0;
  }
}

module.exports = BlogComment;

