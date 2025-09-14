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
    // inlineImages removed intentionally
    seoTitle: row.seo_title || null,
    seoDescription: row.seo_description || null,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: row.slug,
  };
}

/**
 * Convert a string to a URL-friendly slug.
 * Lowercase, replace non-alphanum with -, collapse dashes, trim.
 */
function slugify(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD") // separate accents
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/**
 * Ensure the slug is unique in the blog_posts table.
 * If conflict, append -1, -2, ... until unique.
 * excludeId (optional) excludes a specific row id (useful on update).
 */
async function ensureUniqueSlug(baseSlug, excludeId = null) {
  if (!baseSlug) baseSlug = String(Date.now());
  let slug = baseSlug;
  let i = 1;

  while (true) {
    const sql =
      "SELECT id FROM blog_posts WHERE slug = ?" +
      (excludeId ? " AND id != ?" : "");
    const params = excludeId ? [slug, excludeId] : [slug];
    const [rows] = await db.execute(sql, params);
    if (!rows || rows.length === 0) {
      return slug;
    }
    slug = `${baseSlug}-${i++}`;
  }
}

class BlogPost {
  static async create(payload) {
    const tagsJson = JSON.stringify(payload.tags ?? []);
    const now = new Date();
    const createdAt = formatDateTime(now);
    const updatedAt = createdAt;
    const publishedAt =
      payload.status === "published" ? formatDateTime(new Date()) : null;

    // Determine slug: use provided slug if any, otherwise generate from title.
    const baseSlug = slugify(payload.slug ?? payload.title ?? "");
    const slug = await ensureUniqueSlug(baseSlug);

    const [result] = await db.execute(
      `INSERT INTO blog_posts
       (title, content, excerpt, author, category, tags, featured, featured_image, seo_title, seo_description, status, published_at, created_at, updated_at, slug)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.title,
        payload.content,
        payload.excerpt,
        payload.author || "Admin",
        payload.category,
        tagsJson,
        payload.featured ? 1 : 0,
        payload.featuredImage || null,
        payload.seoTitle || null,
        payload.seoDescription || null,
        payload.status || "draft",
        publishedAt,
        createdAt,
        updatedAt,
        slug,
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

    const sql = `SELECT * FROM blog_posts ${whereSql} ORDER BY published_at DESC, created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;

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
  // Find post by slug
  static async findBySlug(slug) {
    if (!slug) return null;
    const [rows] = await db.execute("SELECT * FROM blog_posts WHERE slug = ?", [slug]);
    if (!rows || !rows[0]) return null;
    return mapRow(rows[0]);
  }

  static async update(id, payload) {
    const existing = await this.findById(id);
    if (!existing) return 0;

    // Decide tags
    const tagsJson = JSON.stringify(payload.tags ?? existing.tags);

    // Featured image fallback
    const featuredImage =
      payload.featuredImage !== undefined
        ? payload.featuredImage
        : existing.featuredImage;

    // PublishedAt logic: if status becomes published and wasn't published before, set now
    const publishedAt =
      payload.status === "published" && !existing.publishedAt
        ? formatDateTime(new Date())
        : payload.publishedAt
        ? formatDateTime(new Date(payload.publishedAt))
        : existing.publishedAt;

    // Slug logic:
    // - If payload.slug provided (even empty string), use sanitized payload.slug
    // - Else if payload.title provided and different from existing.title, regenerate from title
    // - Else keep existing.slug
    let newSlug;
    if (payload.slug !== undefined && payload.slug !== null) {
      const base = slugify(payload.slug || payload.title || existing.title || "");
      newSlug = await ensureUniqueSlug(base, id);
    } else if (payload.title && payload.title !== existing.title) {
      const base = slugify(payload.title);
      newSlug = await ensureUniqueSlug(base, id);
    } else {
      newSlug = existing.slug;
    }

    const [result] = await db.execute(
      `UPDATE blog_posts SET
        title = ?, content = ?, excerpt = ?, author = ?, category = ?,
        tags = ?, featured = ?, featured_image = ?, seo_title = ?, seo_description = ?,
        status = ?, published_at = ?, slug = ?, updated_at = CURRENT_TIMESTAMP
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
        payload.seoTitle ?? existing.seoTitle,
        payload.seoDescription ?? existing.seoDescription,
        payload.status ?? existing.status,
        publishedAt,
        newSlug,
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

  // Removed addInlineImages and deleteSpecificInlineImages methods
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
  