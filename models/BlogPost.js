// models/BlogPost.js
const db = require("../config/database");

function safeParseJsonArray(s) {
  if (!s) return [];
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p : [];
  } catch {
    return String(s)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    excerpt: row.excerpt,
    author: row.author,
    category: row.category,
    tags: safeParseJsonArray(row.tags),
    featured: !!row.featured,
    featuredImage: row.featured_image || null,
    inlineImages: safeParseJsonArray(row.inline_images),
    seoTitle: row.seo_title || null,
    seoDescription: row.seo_description || null,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class BlogPost {
  static async create(payload) {
    const tagsJson = JSON.stringify(payload.tags ?? []);
    const inlineJson =
      payload.inlineImages && payload.inlineImages.length
        ? JSON.stringify(payload.inlineImages)
        : null;
    const publishedAt =
      payload.status === "published" ? formatDateTime(new Date()) : null;

    const [result] = await db.execute(
      `INSERT INTO blog_posts
       (title, content, excerpt, author, category, tags, featured, featured_image, inline_images, seo_title, seo_description, status, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.title,
        payload.content,
        payload.excerpt,
        payload.author || "Admin",
        payload.category,
        tagsJson,
        payload.featured ? 1 : 0,
        payload.featuredImage || null,
        inlineJson,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.status || "draft",
        publishedAt,
      ]
    );
    return result.insertId;
  }

  static async findAll({ page = 1, limit = 20, q, category, status } = {}) {
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(100, Number(limit) || 20);
    const offset = (pageNum - 1) * limitNum;

    const where = [];
    const vals = [];

    if (q) {
      where.push("(title LIKE ? OR content LIKE ? OR excerpt LIKE ?)");
      const like = `%${q}%`;
      vals.push(like, like, like);
    }
    if (category) {
      where.push("category = ?");
      vals.push(category);
    }
    if (status) {
      where.push("status = ?");
      vals.push(status);
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    // IMPORTANT: inline the validated numeric limit/offset to avoid driver/server prepared-statement issues
    const sql = `SELECT * FROM blog_posts ${whereSql} ORDER BY published_at DESC, created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;

    // debug log (optional) - remove or comment out in production
    // console.log('findAll SQL:', sql, 'VALUES:', vals);

    const [rows] = await db.execute(sql, vals);
    return rows.map(mapRow);
  }

  static async findById(id) {
    const [rows] = await db.execute("SELECT * FROM blog_posts WHERE id = ?", [
      id,
    ]);
    if (!rows[0]) return null;
    return mapRow(rows[0]);
  }

  static async update(id, payload) {
    const existing = await this.findById(id);
    if (!existing) return 0;

    const tagsJson = JSON.stringify(payload.tags ?? existing.tags);
    // Inline images: if payload.inlineImages === undefined -> keep existing; if provided -> set to provided array (can be [])
    const inlineJson =
      payload.inlineImages === undefined
        ? JSON.stringify(existing.inlineImages)
        : payload.inlineImages && payload.inlineImages.length
        ? JSON.stringify(payload.inlineImages)
        : null;

    const featuredImage =
      payload.featuredImage !== undefined
        ? payload.featuredImage
        : existing.featuredImage;
    const publishedAt =
      payload.status === "published" && !existing.publishedAt
        ? formatDateTime(new Date())
        : payload.publishedAt
        ? formatDateTime(new Date(payload.publishedAt))
        : existing.publishedAt;

    const [result] = await db.execute(
      `UPDATE blog_posts SET
        title = ?, content = ?, excerpt = ?, author = ?, category = ?,
        tags = ?, featured = ?, featured_image = ?, inline_images = ?, seo_title = ?, seo_description = ?,
        status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        payload.title ?? existing.title,
        payload.content ?? existing.content,
        payload.excerpt ?? existing.excerpt,
        payload.author ?? existing.author,
        payload.category ?? existing.category,
        tagsJson,
        typeof payload.featured === "boolean"
          ? payload.featured
            ? 1
            : 0
          : existing.featured
          ? 1
          : 0,
        featuredImage,
        inlineJson,
        payload.seoTitle ?? existing.seoTitle,
        payload.seoDescription ?? existing.seoDescription,
        payload.status ?? existing.status,
        publishedAt,
        id,
      ]
    );
    return result.affectedRows;
  }

  static async delete(id) {
    const [result] = await db.execute("DELETE FROM blog_posts WHERE id = ?", [
      id,
    ]);
    return result.affectedRows;
  }

  static async addInlineImages(postId, imageUrls = []) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0)
      return { affected: 0, inlineImages: [] };
    const p = await this.findById(postId);
    if (!p) return { affected: 0, inlineImages: [] };
    const current = Array.isArray(p.inlineImages)
      ? p.inlineImages
      : safeParseJsonArray(p.inline_images);
    const merged = [...current, ...imageUrls];
    const [res] = await db.execute(
      "UPDATE blog_posts SET inline_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(merged), postId]
    );
    return { affected: res.affectedRows, inlineImages: merged };
  }

  static async deleteSpecificInlineImages(postId, imagesToDelete = []) {
    if (!Array.isArray(imagesToDelete) || imagesToDelete.length === 0)
      return { affected: 0, inlineImages: [] };
    const p = await this.findById(postId);
    if (!p) return { affected: 0, inlineImages: [] };
    const current = Array.isArray(p.inlineImages)
      ? p.inlineImages
      : safeParseJsonArray(p.inline_images);
    const remaining = current.filter((img) => !imagesToDelete.includes(img));
    const [res] = await db.execute(
      "UPDATE blog_posts SET inline_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [remaining.length ? JSON.stringify(remaining) : null, postId]
    );
    return { affected: res.affectedRows, inlineImages: remaining };
  }

  static async getFeatured(limit = 5) {
    const [rows] = await db.execute(
      "SELECT * FROM blog_posts WHERE featured = 1 ORDER BY published_at DESC LIMIT ?",
      [Number(limit)]
    );
    return rows.map(mapRow);
  }

  static async publish(id) {
    const [res] = await db.execute(
      "UPDATE blog_posts SET status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ["published", formatDateTime(new Date()), id]
    );
    return res.affectedRows;
  }
}

module.exports = BlogPost;
