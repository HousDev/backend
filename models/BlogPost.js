// const db = require("../config/database");

// /* ---------- Helpers ---------- */
// function safeParseJsonArray(s) {
//   if (!s) return [];
//   try {
//     const p = JSON.parse(s);
//     return Array.isArray(p) ? p : [];
//   } catch {
//     return String(s)
//       .split(",")
//       .map((x) => x.trim())
//       .filter(Boolean);
//   }
// }

// function formatDateTime(d) {
//   const pad = (n) => String(n).padStart(2, "0");
//   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
//     d.getHours()
//   )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
// }

// function mapRow(row) {
//   return {
//     id: row.id,
//     title: row.title,
//     content: row.content,
//     excerpt: row.excerpt,
//     author: row.author,
//     category: row.category,
//     tags: safeParseJsonArray(row.tags),
//     featured: !!row.featured,
//     featuredImage: row.featured_image || null,
//     seoTitle: row.seo_title || null,
//     seoDescription: row.seo_description || null,
//     status: row.status,
//     publishedAt: row.published_at,
//     createdAt: row.created_at,
//     updatedAt: row.updated_at,
//     slug: row.slug,

//     rssSourceId: row.rssSourceId ?? row.source_id ?? null,
//     rssSourceName: row.rssSourceName ?? null,
//     sourceType: row.sourceType ?? (row.source_id ? "rss" : "manual"),

//     externalGuid: row.external_guid ?? null,
//     sourceLink: row.source_link ?? null,
//   };
// }

// /* ---------- Slug utilities ---------- */
// function slugify(text) {
//   if (!text) return "";
//   return String(text)
//     .toLowerCase()
//     .normalize("NFKD")
//     .replace(/[\u0300-\u036f]/g, "")
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-+|-+$/g, "")
//     .replace(/-+/g, "-");
// }

// async function ensureUniqueSlug(baseSlug, excludeId = null) {
//   if (!baseSlug) baseSlug = String(Date.now());
//   let slug = baseSlug;
//   let i = 1;

//   while (true) {
//     const sql =
//       "SELECT id FROM blog_posts WHERE slug = ?" +
//       (excludeId ? " AND id != ?" : "");
//     const params = excludeId ? [slug, excludeId] : [slug];
//     const [rows] = await db.execute(sql, params);
//     if (!rows || rows.length === 0) return slug;
//     slug = `${baseSlug}-${i++}`;
//   }
// }

// const boolish = (v) => v === true || v === 1 || v === "1" || v === "true";

// /* ====================== MAIN CLASS ===================== */
// class BlogPost {
//   static async create(payload) {
//     const tagsJson = JSON.stringify(payload.tags ?? []);
//     const now = new Date();
//     const createdAt = formatDateTime(now);
//     const updatedAt = createdAt;
//     const publishedAt =
//       payload.status === "published"
//         ? formatDateTime(
//             payload.publishedAt ? new Date(payload.publishedAt) : new Date()
//           )
//         : null;

//     const baseSlug = slugify(payload.slug ?? payload.title ?? "");
//     const slug = await ensureUniqueSlug(baseSlug);

//     const [result] = await db.execute(
//       `INSERT INTO blog_posts
//        (title, content, excerpt, author, category, tags, featured, featured_image, seo_title,
//         seo_description, status, published_at, created_at, updated_at, slug)
//        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
//       [
//         payload.title,
//         payload.content,
//         payload.excerpt,
//         payload.author || "Admin",
//         payload.category,
//         tagsJson,
//         payload.featured ? 1 : 0,
//         payload.featuredImage || null,
//         payload.seoTitle || null,
//         payload.seoDescription || null,
//         payload.status || "draft",
//         publishedAt,
//         createdAt,
//         updatedAt,
//         slug,
//       ]
//     );
//     return result.insertId;
//   }

//   // LEFT JOIN rss_sources to return source name/id
//   static async findAll({ page = 1, limit = 20, q, category, status } = {}) {
//     const pageNum = Number(page) || 1;
//     const limitNum = Math.min(100, Number(limit) || 20);
//     const offset = (pageNum - 1) * limitNum;

//     const where = [];
//     const vals = [];

//     if (q) {
//       where.push("(bp.title LIKE ? OR bp.content LIKE ? OR bp.excerpt LIKE ?)");
//       const like = `%${q}%`;
//       vals.push(like, like, like);
//     }
//     if (category) {
//       where.push("bp.category = ?");
//       vals.push(category);
//     }
//     if (status) {
//       where.push("bp.status = ?");
//       vals.push(status);
//     }

//     const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

//     const sql = `
//       SELECT
//         bp.*,
//         bp.source_id AS rssSourceId,
//         rs.name       AS rssSourceName
//       FROM blog_posts bp
//       LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//       ${whereSql}
//       ORDER BY bp.published_at DESC, bp.created_at DESC
//       LIMIT ${limitNum} OFFSET ${offset}`;
//     const [rows] = await db.execute(sql, vals);
//     return rows.map(mapRow);
//   }

//   static async findById(id) {
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.id = ?`,
//       [id]
//     );
//     if (!rows[0]) return null;
//     return mapRow(rows[0]);
//   }

//   static async findByIds(ids = []) {
//     if (!Array.isArray(ids) || ids.length === 0) return [];
//     const placeholders = ids.map(() => "?").join(",");
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.id IN (${placeholders})`,
//       ids
//     );
//     return rows.map(mapRow);
//   }

//   static async findBySlug(slug) {
//     if (!slug) return null;
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.slug = ?`,
//       [slug]
//     );
//     if (!rows || !rows[0]) return null;
//     return mapRow(rows[0]);
//   }

//   // NEW: published-only by slug (for public)
//   static async findPublishedBySlug(slug) {
//     if (!slug) return null;
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.slug = ? AND bp.status = 'published'
//        LIMIT 1`,
//       [slug]
//     );
//     if (!rows || !rows[0]) return null;
//     return mapRow(rows[0]);
//   }

//   static async update(id, payload) {
//     const existing = await this.findById(id);
//     if (!existing) return 0;

//     const tagsJson = JSON.stringify(
//       payload.tags !== undefined ? payload.tags : existing.tags
//     );
//     const featuredImage =
//       payload.featuredImage !== undefined
//         ? payload.featuredImage
//         : existing.featuredImage;

//     const willBePublished =
//       payload.status === "published" || existing.status === "published";
//     const publishedAt =
//       payload.status === "published" && !existing.publishedAt
//         ? formatDateTime(
//             payload.publishedAt ? new Date(payload.publishedAt) : new Date()
//           )
//         : payload.publishedAt
//         ? formatDateTime(new Date(payload.publishedAt))
//         : existing.publishedAt;

//     let newSlug;
//     if (payload.slug !== undefined && payload.slug !== null) {
//       const base = slugify(
//         payload.slug || payload.title || existing.title || ""
//       );
//       newSlug = await ensureUniqueSlug(base, id);
//     } else if (payload.title && payload.title !== existing.title) {
//       const base = slugify(payload.title);
//       newSlug = await ensureUniqueSlug(base, id);
//     } else {
//       newSlug = existing.slug;
//     }

//     const [result] = await db.execute(
//       `UPDATE blog_posts SET
//         title = ?, content = ?, excerpt = ?, author = ?, category = ?,
//         tags = ?, featured = ?, featured_image = ?, seo_title = ?, seo_description = ?,
//         status = ?, published_at = ?, slug = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [
//         payload.title ?? existing.title,
//         payload.content ?? existing.content,
//         payload.excerpt ?? existing.excerpt,
//         payload.author ?? existing.author,
//         payload.category ?? existing.category,
//         tagsJson,
//         typeof payload.featured === "boolean"
//           ? payload.featured
//             ? 1
//             : 0
//           : existing.featured
//           ? 1
//           : 0,
//         featuredImage,
//         payload.seoTitle ?? existing.seoTitle,
//         payload.seoDescription ?? existing.seoDescription,
//         payload.status ?? existing.status,
//         willBePublished ? publishedAt : null,
//         newSlug,
//         id,
//       ]
//     );
//     return result.affectedRows;
//   }

//   static async delete(id) {
//     const [result] = await db.execute("DELETE FROM blog_posts WHERE id = ?", [
//       id,
//     ]);
//     return result.affectedRows;
//   }

//   static async getFeatured(limit = 5) {
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.featured = 1
//        ORDER BY bp.published_at DESC
//        LIMIT ?`,
//       [Number(limit)]
//     );
//     return rows.map(mapRow);
//   }

//   static async publish(id) {
//     const [res] = await db.execute(
//       "UPDATE blog_posts SET status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
//       ["published", formatDateTime(new Date()), id]
//     );
//     return res.affectedRows;
//   }

//   /* --------- BULK HELPERS --------- */

//   static async bulkPublish(ids = []) {
//     if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
//     const placeholders = ids.map(() => "?").join(",");
//     const now = formatDateTime(new Date());
//     const [res] = await db.execute(
//       `UPDATE blog_posts
//        SET status = 'published',
//            published_at = ?,
//            updated_at = CURRENT_TIMESTAMP
//        WHERE id IN (${placeholders})`,
//       [now, ...ids]
//     );
//     return { updated: res.affectedRows || 0 };
//   }

//   static async bulkUpdate(ids = [], data = {}) {
//     if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
//     if (!data || typeof data !== "object") return { updated: 0 };

//     const setParts = [];
//     const setVals = [];
//     const add = (frag, val) => {
//       setParts.push(frag);
//       setVals.push(val);
//     };

//     if (data.title !== undefined) add("title = ?", data.title);
//     if (data.content !== undefined) add("content = ?", data.content);
//     if (data.excerpt !== undefined) add("excerpt = ?", data.excerpt);
//     if (data.author !== undefined) add("author = ?", data.author);
//     if (data.category !== undefined) add("category = ?", data.category);

//     if (data.tags !== undefined) {
//       const tagsJson = JSON.stringify(
//         Array.isArray(data.tags) ? data.tags : safeParseJsonArray(data.tags)
//       );
//       add("tags = ?", tagsJson);
//     }

//     if (data.featured !== undefined) {
//       add("featured = ?", boolish(data.featured) ? 1 : 0);
//     }

//     if (data.featuredImage !== undefined) {
//       add("featured_image = ?", data.featuredImage || null);
//     }

//     if (data.seoTitle !== undefined)
//       add("seo_title = ?", data.seoTitle || null);
//     if (data.seoDescription !== undefined)
//       add("seo_description = ?", data.seoDescription || null);

//     if (data.status !== undefined) {
//       add("status = ?", data.status);
//       if (data.status === "published") {
//         add("published_at = ?", formatDateTime(new Date()));
//       } else if (data.publishedAt !== undefined) {
//         add(
//           "published_at = ?",
//           data.publishedAt ? formatDateTime(new Date(data.publishedAt)) : null
//         );
//       }
//     } else if (data.publishedAt !== undefined) {
//       add(
//         "published_at = ?",
//         data.publishedAt ? formatDateTime(new Date(data.publishedAt)) : null
//       );
//     }

//     add("updated_at = CURRENT_TIMESTAMP", undefined);

//     const filtered = setParts.filter(
//       (p) => p !== "updated_at = CURRENT_TIMESTAMP"
//     );
//     const values = [...setVals.filter((v) => v !== undefined)];
//     const setSql =
//       (filtered.length ? filtered.join(", ") + ", " : "") +
//       "updated_at = CURRENT_TIMESTAMP";

//     const placeholders = ids.map(() => "?").join(",");
//     const sql = `UPDATE blog_posts SET ${setSql} WHERE id IN (${placeholders})`;

//     const [res] = await db.execute(sql, [...values, ...ids]);
//     return { updated: res.affectedRows || 0 };
//   }

//   static async bulkDelete(ids = []) {
//     if (!Array.isArray(ids) || ids.length === 0) return { deleted: 0 };
//     const placeholders = ids.map(() => "?").join(",");
//     const [res] = await db.execute(
//       `DELETE FROM blog_posts WHERE id IN (${placeholders})`,
//       ids
//     );
//     return { deleted: res.affectedRows || 0 };
//   }

//   static async deleteMany(ids = []) {
//     return this.bulkDelete(ids);
//   }

//   /* --------- RSS insert (unchanged except style) --------- */
//   static async insertFromRSS({ item, source, autoPublish }) {
//     if (!item) throw new Error("RSS item missing");

//     const guid =
//       item.guid || item.id || item.link || item.url || String(Date.now());
//     const originalUrl = item.link || item.url || null;

//     const [existingByGuid] = await db.execute(
//       "SELECT id FROM blog_posts WHERE external_guid = ? LIMIT 1",
//       [guid]
//     );
//     if (existingByGuid.length)
//       return { inserted: false, id: existingByGuid[0].id };

//     const title = item.title || "Untitled";
//     const content =
//       item["content:encoded"] || item.content || item.summary || "";
//     const excerpt = (item.contentSnippet || item.summary || "")
//       .replace(/<[^>]+>/g, "")
//       .slice(0, 500);

//     const category = source?.category || "";
//     const author =
//       item.creator || item.author?.name || item.author || "RSS Author";
//     const featuredImage =
//       item.enclosure?.url || item.image || item.thumbnail || null;

//     const publishedAtRaw = item.isoDate || item.pubDate || new Date();
//     const publishedAt = formatDateTime(new Date(publishedAtRaw));

//     const tagsJson = JSON.stringify(item.categories || []);
//     const slugBase = slugify(title);
//     const slug = await ensureUniqueSlug(slugBase);
//     const status = autoPublish ? "published" : "draft";

//     const [result] = await db.execute(
//       `INSERT INTO blog_posts
//        (title, slug, content, excerpt, author, category, tags, featured, featured_image,
//         seo_title, seo_description, external_guid, source_id, source_link,
//         status, published_at, created_at, updated_at)
//        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
//       [
//         title,
//         slug,
//         content,
//         excerpt,
//         author,
//         category,
//         tagsJson,
//         0,
//         featuredImage,
//         title,
//         excerpt,
//         guid,
//         source?.id || null,
//         originalUrl || null,
//         status,
//         publishedAt,
//       ]
//     );

//     return { inserted: true, id: result.insertId };
//   }
// }

// module.exports = BlogPost;


// const db = require("../config/database");

// /* ---------- Helpers ---------- */
// function safeParseJsonArray(s) {
//   if (!s) return [];
//   try {
//     const p = JSON.parse(s);
//     return Array.isArray(p) ? p : [];
//   } catch {
//     return String(s)
//       .split(",")
//       .map((x) => x.trim())
//       .filter(Boolean);
//   }
// }
// function formatDateTime(d) {
//   const pad = (n) => String(n).padStart(2, "0");
//   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
//     d.getHours()
//   )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
// }
// function mapRow(row) {
//   return {
//     id: row.id,
//     title: row.title,
//     content: row.content,
//     excerpt: row.excerpt,
//     author: row.author,
//     category: row.category,
//     tags: safeParseJsonArray(row.tags),
//     featured: !!row.featured,
//     featuredImage: row.featured_image || null,
//     seoTitle: row.seo_title || null,
//     seoDescription: row.seo_description || null,
//     status: row.status,
//     publishedAt: row.published_at,
//     createdAt: row.created_at,
//     updatedAt: row.updated_at,
//     slug: row.slug,
//     rssSourceId: row.rssSourceId ?? row.source_id ?? null,
//     rssSourceName: row.rssSourceName ?? null,
//     sourceType: row.sourceType ?? (row.source_id ? "rss" : "manual"),
//     externalGuid: row.external_guid ?? null,
//     sourceLink: row.source_link ?? null,
//   };
// }

// /* ---------- Slug utilities ---------- */
// function slugify(text) {
//   if (!text) return "";
//   return String(text)
//     .toLowerCase()
//     .normalize("NFKD")
//     .replace(/[\u0300-\u036f]/g, "")
//     .replace(/[^a-z0-9]+/g, "-")
//     .replace(/^-+|-+$/g, "")
//     .replace(/-+/g, "-");
// }
// async function ensureUniqueSlug(baseSlug, excludeId = null) {
//   if (!baseSlug) baseSlug = String(Date.now());
//   let slug = baseSlug;
//   let i = 1;
//   while (true) {
//     const sql =
//       "SELECT id FROM blog_posts WHERE slug = ?" +
//       (excludeId ? " AND id != ?" : "");
//     const params = excludeId ? [slug, excludeId] : [slug];
//     const [rows] = await db.execute(sql, params);
//     if (!rows || rows.length === 0) return slug;
//     slug = `${baseSlug}-${i++}`;
//   }
// }
// const boolish = (v) => v === true || v === 1 || v === "1" || v === "true";

// /* ====================== MAIN CLASS ===================== */
// class BlogPost {
//   static async create(payload) {
//     const tagsJson = JSON.stringify(payload.tags ?? []);
//     const now = new Date();
//     const createdAt = formatDateTime(now);
//     const updatedAt = createdAt;
//     const publishedAt =
//       payload.status === "published"
//         ? formatDateTime(
//             payload.publishedAt ? new Date(payload.publishedAt) : new Date()
//           )
//         : null;

//     const baseSlug = slugify(payload.slug ?? payload.title ?? "");
//     const slug = await ensureUniqueSlug(baseSlug);

//     const [result] = await db.execute(
//       `INSERT INTO blog_posts
//        (title, content, excerpt, author, category, tags, featured, featured_image, seo_title,
//         seo_description, status, published_at, created_at, updated_at, slug)
//        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
//       [
//         payload.title,
//         payload.content,
//         payload.excerpt,
//         payload.author || "Admin",
//         payload.category,
//         tagsJson,
//         payload.featured ? 1 : 0,
//         payload.featuredImage || null,
//         payload.seoTitle || null,
//         payload.seoDescription || null,
//         payload.status || "draft",
//         publishedAt,
//         createdAt,
//         updatedAt,
//         slug,
//       ]
//     );
//     return result.insertId;
//   }

//   // LEFT JOIN rss_sources to return source name/id
//   static async findAll({ page = 1, limit = 20, q, category, status } = {}) {
//     const pageNum = Number(page) || 1;
//     const limitNum = Math.min(100, Number(limit) || 20);
//     const offset = (pageNum - 1) * limitNum;

//     const where = [];
//     const vals = [];

//     if (q) {
//       where.push("(bp.title LIKE ? OR bp.content LIKE ? OR bp.excerpt LIKE ?)");
//       const like = `%${q}%`;
//       vals.push(like, like, like);
//     }
//     if (category) {
//       where.push("bp.category = ?");
//       vals.push(category);
//     }
//     if (status) {
//       // case-insensitive compare
//       where.push("LOWER(bp.status) = ?");
//       vals.push(String(status).toLowerCase());
//     }

//     const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

//     // 👇 Important: inline LIMIT/OFFSET as integers (no placeholders here)
//     const sql = `
//     SELECT
//       bp.*,
//       bp.source_id AS rssSourceId,
//       rs.name       AS rssSourceName
//     FROM blog_posts bp
//     LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//     ${whereSql}
//     ORDER BY bp.published_at DESC, bp.created_at DESC
//     LIMIT ${parseInt(limitNum, 10)} OFFSET ${parseInt(offset, 10)}
//   `;

//     const [rows] = await db.execute(sql, vals);
//     return rows.map(mapRow);
//   }

//   static async findById(id) {
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.id = ?`,
//       [id]
//     );
//     if (!rows[0]) return null;
//     return mapRow(rows[0]);
//   }

//   static async findByIds(ids = []) {
//     if (!Array.isArray(ids) || ids.length === 0) return [];
//     const placeholders = ids.map(() => "?").join(",");
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.id IN (${placeholders})`,
//       ids
//     );
//     return rows.map(mapRow);
//   }

//   static async findBySlug(slug) {
//     if (!slug) return null;
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.slug = ?`,
//       [slug]
//     );
//     if (!rows || !rows[0]) return null;
//     return mapRow(rows[0]);
//   }

//   // published-only by slug (for public)
//   static async findPublishedBySlug(slug) {
//     if (!slug) return null;
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.slug = ? AND bp.status = 'published'
//        LIMIT 1`,
//       [slug]
//     );
//     if (!rows || !rows[0]) return null;
//     return mapRow(rows[0]);
//   }

//   static async update(id, payload) {
//     const existing = await this.findById(id);
//     if (!existing) return 0;

//     const tagsJson = JSON.stringify(
//       payload.tags !== undefined ? payload.tags : existing.tags
//     );
//     const featuredImage =
//       payload.featuredImage !== undefined
//         ? payload.featuredImage
//         : existing.featuredImage;

//     const willBePublished =
//       payload.status === "published" || existing.status === "published";
//     const publishedAt =
//       payload.status === "published" && !existing.publishedAt
//         ? formatDateTime(
//             payload.publishedAt ? new Date(payload.publishedAt) : new Date()
//           )
//         : payload.publishedAt
//         ? formatDateTime(new Date(payload.publishedAt))
//         : existing.publishedAt;

//     let newSlug;
//     if (payload.slug !== undefined && payload.slug !== null) {
//       const base = slugify(
//         payload.slug || payload.title || existing.title || ""
//       );
//       newSlug = await ensureUniqueSlug(base, id);
//     } else if (payload.title && payload.title !== existing.title) {
//       const base = slugify(payload.title);
//       newSlug = await ensureUniqueSlug(base, id);
//     } else {
//       newSlug = existing.slug;
//     }

//     const [result] = await db.execute(
//       `UPDATE blog_posts SET
//         title = ?, content = ?, excerpt = ?, author = ?, category = ?,
//         tags = ?, featured = ?, featured_image = ?, seo_title = ?, seo_description = ?,
//         status = ?, published_at = ?, slug = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [
//         payload.title ?? existing.title,
//         payload.content ?? existing.content,
//         payload.excerpt ?? existing.excerpt,
//         payload.author ?? existing.author,
//         payload.category ?? existing.category,
//         tagsJson,
//         typeof payload.featured === "boolean"
//           ? payload.featured
//             ? 1
//             : 0
//           : existing.featured
//           ? 1
//           : 0,
//         featuredImage,
//         payload.seoTitle ?? existing.seoTitle,
//         payload.seoDescription ?? existing.seoDescription,
//         payload.status ?? existing.status,
//         willBePublished ? publishedAt : null,
//         newSlug,
//         id,
//       ]
//     );
//     return result.affectedRows;
//   }

//   static async delete(id) {
//     const [result] = await db.execute("DELETE FROM blog_posts WHERE id = ?", [
//       id,
//     ]);
//     return result.affectedRows;
//   }

//   static async getFeatured(limit = 5) {
//     const [rows] = await db.execute(
//       `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
//        FROM blog_posts bp
//        LEFT JOIN rss_sources rs ON rs.id = bp.source_id
//        WHERE bp.featured = 1
//        ORDER BY bp.published_at DESC
//        LIMIT ?`,
//       [Number(limit)]
//     );
//     return rows.map(mapRow);
//   }

//   static async publish(id) {
//     const [res] = await db.execute(
//       "UPDATE blog_posts SET status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
//       ["published", formatDateTime(new Date()), id]
//     );
//     return res.affectedRows;
//   }

//   /* --------- BULK HELPERS --------- */
//   static async bulkPublish(ids = []) {
//     if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
//     const placeholders = ids.map(() => "?").join(",");
//     const now = formatDateTime(new Date());
//     const [res] = await db.execute(
//       `UPDATE blog_posts
//        SET status = 'published',
//            published_at = ?,
//            updated_at = CURRENT_TIMESTAMP
//        WHERE id IN (${placeholders})`,
//       [now, ...ids]
//     );
//     return { updated: res.affectedRows || 0 };
//   }

//   static async bulkUpdate(ids = [], data = {}) {
//     if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
//     if (!data || typeof data !== "object") return { updated: 0 };

//     const setParts = [];
//     const setVals = [];
//     const add = (frag, val) => {
//       setParts.push(frag);
//       setVals.push(val);
//     };

//     if (data.title !== undefined) add("title = ?", data.title);
//     if (data.content !== undefined) add("content = ?", data.content);
//     if (data.excerpt !== undefined) add("excerpt = ?", data.excerpt);
//     if (data.author !== undefined) add("author = ?", data.author);
//     if (data.category !== undefined) add("category = ?", data.category);

//     if (data.tags !== undefined) {
//       const tagsJson = JSON.stringify(
//         Array.isArray(data.tags) ? data.tags : safeParseJsonArray(data.tags)
//       );
//       add("tags = ?", tagsJson);
//     }

//     if (data.featured !== undefined)
//       add("featured = ?", boolish(data.featured) ? 1 : 0);
//     if (data.featuredImage !== undefined)
//       add("featured_image = ?", data.featuredImage || null);
//     if (data.seoTitle !== undefined)
//       add("seo_title = ?", data.seoTitle || null);
//     if (data.seoDescription !== undefined)
//       add("seo_description = ?", data.seoDescription || null);

//     if (data.status !== undefined) {
//       add("status = ?", data.status);
//       if (data.status === "published") {
//         add("published_at = ?", formatDateTime(new Date()));
//       } else if (data.publishedAt !== undefined) {
//         add(
//           "published_at = ?",
//           data.publishedAt ? formatDateTime(new Date(data.publishedAt)) : null
//         );
//       }
//     } else if (data.publishedAt !== undefined) {
//       add(
//         "published_at = ?",
//         data.publishedAt ? formatDateTime(new Date(data.publishedAt)) : null
//       );
//     }

//     add("updated_at = CURRENT_TIMESTAMP", undefined);

//     const filtered = setParts.filter(
//       (p) => p !== "updated_at = CURRENT_TIMESTAMP"
//     );
//     const values = [...setVals.filter((v) => v !== undefined)];
//     const setSql =
//       (filtered.length ? filtered.join(", ") + ", " : "") +
//       "updated_at = CURRENT_TIMESTAMP";

//     const placeholders = ids.map(() => "?").join(",");
//     const sql = `UPDATE blog_posts SET ${setSql} WHERE id IN (${placeholders})`;

//     const [res] = await db.execute(sql, [...values, ...ids]);
//     return { updated: res.affectedRows || 0 };
//   }

//   static async bulkDelete(ids = []) {
//     if (!Array.isArray(ids) || ids.length === 0) return { deleted: 0 };
//     const placeholders = ids.map(() => "?").join(",");
//     const [res] = await db.execute(
//       `DELETE FROM blog_posts WHERE id IN (${placeholders})`,
//       ids
//     );
//     return { deleted: res.affectedRows || 0 };
//   }

//   static async deleteMany(ids = []) {
//     return this.bulkDelete(ids);
//   }

//   /* --------- RSS insert --------- */
//   static async insertFromRSS({ item, source, autoPublish }) {
//     if (!item) throw new Error("RSS item missing");

//     const guid =
//       item.guid || item.id || item.link || item.url || String(Date.now());
//     const originalUrl = item.link || item.url || null;

//     const [existingByGuid] = await db.execute(
//       "SELECT id FROM blog_posts WHERE external_guid = ? LIMIT 1",
//       [guid]
//     );
//     if (existingByGuid.length)
//       return { inserted: false, id: existingByGuid[0].id };

//     const title = item.title || "Untitled";
//     const content =
//       item["content:encoded"] || item.content || item.summary || "";
//     const excerpt = (item.contentSnippet || item.summary || "")
//       .replace(/<[^>]+>/g, "")
//       .slice(0, 500);
//     const category = source?.category || "";
//     const author =
//       item.creator || item.author?.name || item.author || "RSS Author";
//     const featuredImage =
//       item.enclosure?.url || item.image || item.thumbnail || null;

//     const publishedAtRaw = item.isoDate || item.pubDate || new Date();
//     const publishedAt = formatDateTime(new Date(publishedAtRaw));

//     const tagsJson = JSON.stringify(item.categories || []);
//     const slugBase = slugify(title);
//     const slug = await ensureUniqueSlug(slugBase);
//     const status = autoPublish ? "published" : "draft";

//     const [result] = await db.execute(
//       `INSERT INTO blog_posts
//        (title, slug, content, excerpt, author, category, tags, featured, featured_image,
//         seo_title, seo_description, external_guid, source_id, source_link,
//         status, published_at, created_at, updated_at)
//        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
//       [
//         title,
//         slug,
//         content,
//         excerpt,
//         author,
//         category,
//         tagsJson,
//         0,
//         featuredImage,
//         title,
//         excerpt,
//         guid,
//         source?.id || null,
//         originalUrl || null,
//         status,
//         publishedAt,
//       ]
//     );

//     return { inserted: true, id: result.insertId };
//   }
// }

// module.exports = BlogPost;


// models/BlogPost.js
const db = require("../config/database");

/* ---------- Helpers ---------- */
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
    seoTitle: row.seo_title || null,
    seoDescription: row.seo_description || null,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: row.slug,

    rssSourceId: row.rssSourceId ?? row.source_id ?? null,
    rssSourceName: row.rssSourceName ?? null,
    sourceType: row.sourceType ?? (row.source_id ? "rss" : "manual"),

    externalGuid: row.external_guid ?? null,
    sourceLink: row.source_link ?? null,
  };
}

/* ---------- Slug utilities ---------- */
function slugify(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

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
    if (!rows || rows.length === 0) return slug;
    slug = `${baseSlug}-${i++}`;
  }
}

const boolish = (v) => v === true || v === 1 || v === "1" || v === "true";

/* ====================== MAIN CLASS ===================== */
class BlogPost {
  static async create(payload) {
    const tagsJson = JSON.stringify(payload.tags ?? []);
    const now = new Date();
    const createdAt = formatDateTime(now);
    const updatedAt = createdAt;
    const publishedAt =
      payload.status === "published"
        ? formatDateTime(
            payload.publishedAt ? new Date(payload.publishedAt) : new Date()
          )
        : null;

    const baseSlug = slugify(payload.slug ?? payload.title ?? "");
    const slug = await ensureUniqueSlug(baseSlug);

    const [result] = await db.execute(
      `INSERT INTO blog_posts
       (title, content, excerpt, author, category, tags, featured, featured_image, seo_title,
        seo_description, status, published_at, created_at, updated_at, slug)
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

  // LEFT JOIN rss_sources to return source name/id
  static async findAll({ page = 1, limit = 20, q, category, status } = {}) {
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(100, Number(limit) || 20);
    const offset = (pageNum - 1) * limitNum;

    const where = [];
    const vals = [];

    if (q) {
      where.push("(bp.title LIKE ? OR bp.content LIKE ? OR bp.excerpt LIKE ?)");
      const like = `%${q}%`;
      vals.push(like, like, like);
    }
    if (category) {
      where.push("bp.category = ?");
      vals.push(category);
    }
    if (status) {
      // case-insensitive compare
      where.push("LOWER(bp.status) = ?");
      vals.push(String(status).toLowerCase());
    }

    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

    // Important: inline LIMIT/OFFSET as integers (no placeholders here)
    const sql = `
      SELECT
        bp.*,
        bp.source_id AS rssSourceId,
        rs.name       AS rssSourceName
      FROM blog_posts bp
      LEFT JOIN rss_sources rs ON rs.id = bp.source_id
      ${whereSql}
      ORDER BY bp.published_at DESC, bp.created_at DESC
      LIMIT ${parseInt(limitNum, 10)} OFFSET ${parseInt(offset, 10)}
    `;

    const [rows] = await db.execute(sql, vals);
    return rows.map(mapRow);
  }

  static async findById(id) {
    const [rows] = await db.execute(
      `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
       FROM blog_posts bp
       LEFT JOIN rss_sources rs ON rs.id = bp.source_id
       WHERE bp.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    return mapRow(rows[0]);
  }

  static async findByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
       FROM blog_posts bp
       LEFT JOIN rss_sources rs ON rs.id = bp.source_id
       WHERE bp.id IN (${placeholders})`,
      ids
    );
    return rows.map(mapRow);
  }

  static async findBySlug(slug) {
    if (!slug) return null;
    const [rows] = await db.execute(
      `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
       FROM blog_posts bp
       LEFT JOIN rss_sources rs ON rs.id = bp.source_id
       WHERE bp.slug = ?`,
      [slug]
    );
    if (!rows || !rows[0]) return null;
    return mapRow(rows[0]);
  }

  // published-only by slug (for public)
  static async findPublishedBySlug(slug) {
    if (!slug) return null;
    const [rows] = await db.execute(
      `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
       FROM blog_posts bp
       LEFT JOIN rss_sources rs ON rs.id = bp.source_id
       WHERE bp.slug = ? AND bp.status = 'published'
       LIMIT 1`,
      [slug]
    );
    if (!rows || !rows[0]) return null;
    return mapRow(rows[0]);
  }

  static async update(id, payload) {
    const existing = await this.findById(id);
    if (!existing) return 0;

    const tagsJson = JSON.stringify(
      payload.tags !== undefined ? payload.tags : existing.tags
    );
    const featuredImage =
      payload.featuredImage !== undefined
        ? payload.featuredImage
        : existing.featuredImage;

    const willBePublished =
      payload.status === "published" || existing.status === "published";
    const publishedAt =
      payload.status === "published" && !existing.publishedAt
        ? formatDateTime(
            payload.publishedAt ? new Date(payload.publishedAt) : new Date()
          )
        : payload.publishedAt
        ? formatDateTime(new Date(payload.publishedAt))
        : existing.publishedAt;

    let newSlug;
    if (payload.slug !== undefined && payload.slug !== null) {
      const base = slugify(
        payload.slug || payload.title || existing.title || ""
      );
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
        willBePublished ? publishedAt : null,
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

  static async getFeatured(limit = 5) {
    const [rows] = await db.execute(
      `SELECT bp.*, bp.source_id AS rssSourceId, rs.name AS rssSourceName
       FROM blog_posts bp
       LEFT JOIN rss_sources rs ON rs.id = bp.source_id
       WHERE bp.featured = 1
       ORDER BY bp.published_at DESC
       LIMIT ?`,
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

  /* --------- BULK HELPERS --------- */
  static async bulkPublish(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const now = formatDateTime(new Date());
    const [res] = await db.execute(
      `UPDATE blog_posts
       SET status = 'published',
           published_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      [now, ...ids]
    );
    return { updated: res.affectedRows || 0 };
  }

  static async bulkUpdate(ids = [], data = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    if (!data || typeof data !== "object") return { updated: 0 };

    const setParts = [];
    const setVals = [];
    const add = (frag, val) => {
      setParts.push(frag);
      setVals.push(val);
    };

    if (data.title !== undefined) add("title = ?", data.title);
    if (data.content !== undefined) add("content = ?", data.content);
    if (data.excerpt !== undefined) add("excerpt = ?", data.excerpt);
    if (data.author !== undefined) add("author = ?", data.author);
    if (data.category !== undefined) add("category = ?", data.category);

    if (data.tags !== undefined) {
      const tagsJson = JSON.stringify(
        Array.isArray(data.tags) ? data.tags : safeParseJsonArray(data.tags)
      );
      add("tags = ?", tagsJson);
    }

    if (data.featured !== undefined)
      add("featured = ?", boolish(data.featured) ? 1 : 0);
    if (data.featuredImage !== undefined)
      add("featured_image = ?", data.featuredImage || null);
    if (data.seoTitle !== undefined)
      add("seo_title = ?", data.seoTitle || null);
    if (data.seoDescription !== undefined)
      add("seo_description = ?", data.seoDescription || null);

    if (data.status !== undefined) {
      add("status = ?", data.status);
      if (data.status === "published") {
        add("published_at = ?", formatDateTime(new Date()));
      } else if (data.publishedAt !== undefined) {
        add(
          "published_at = ?",
          data.publishedAt ? formatDateTime(new Date(data.publishedAt)) : null
        );
      }
    } else if (data.publishedAt !== undefined) {
      add(
        "published_at = ?",
        data.publishedAt ? formatDateTime(new Date(data.publishedAt)) : null
      );
    }

    add("updated_at = CURRENT_TIMESTAMP", undefined);

    const filtered = setParts.filter(
      (p) => p !== "updated_at = CURRENT_TIMESTAMP"
    );
    const values = [...setVals.filter((v) => v !== undefined)];
    const setSql =
      (filtered.length ? filtered.join(", ") + ", " : "") +
      "updated_at = CURRENT_TIMESTAMP";

    const placeholders = ids.map(() => "?").join(",");
    const sql = `UPDATE blog_posts SET ${setSql} WHERE id IN (${placeholders})`;

    const [res] = await db.execute(sql, [...values, ...ids]);
    return { updated: res.affectedRows || 0 };
  }

  static async bulkDelete(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return { deleted: 0 };
    const placeholders = ids.map(() => "?").join(",");
    const [res] = await db.execute(
      `DELETE FROM blog_posts WHERE id IN (${placeholders})`,
      ids
    );
    return { deleted: res.affectedRows || 0 };
  }

  static async deleteMany(ids = []) {
    return this.bulkDelete(ids);
  }

  /* --------- RSS insert (SCAN/IMPORT aware) --------- */
  static async insertFromRSS({
    item,
    source,
    dryRun = false,     // true => scan-only (no DB write)
    asDraft = true,     // true => force draft + published_at NULL
    autoPublish = false // only used when asDraft === false
  }) {
    if (!item) throw new Error("RSS item missing");

    // 1) Identify uniqueness
    const guid = item.guid || item.id || item.link || item.url || null;
    const originalUrl = item.link || item.url || null;

    // 2) Duplicate checks: by GUID OR by original URL (source_link)
    if (guid) {
      const [ex1] = await db.execute(
        "SELECT id FROM blog_posts WHERE external_guid = ? LIMIT 1",
        [guid]
      );
      if (ex1 && ex1.length) {
        return dryRun
          ? { wouldInsert: false, reason: "duplicate_guid", dupId: ex1[0].id }
          : { inserted: false, id: ex1[0].id };
      }
    }
    if (originalUrl) {
      const [ex2] = await db.execute(
        "SELECT id FROM blog_posts WHERE source_link = ? LIMIT 1",
        [originalUrl]
      );
      if (ex2 && ex2.length) {
        return dryRun
          ? { wouldInsert: false, reason: "duplicate_link", dupId: ex2[0].id }
          : { inserted: false, id: ex2[0].id };
      }
    }

    // 3) Normalize fields
    const title = item.title || "Untitled";
    const content =
      item["content:encoded"] || item.content || item.summary || "";
    const plainSnippet =
      (item.contentSnippet || item.summary || "")
        .replace(/<[^>]+>/g, "")
        .slice(0, 500) || "";
    const excerpt = plainSnippet;
    const category = source?.category || "";
    const author =
      item.creator || item.author?.name || item.author || "RSS Author";
    const featuredImage =
      item.enclosure?.url || item.image || item.thumbnail || null;

    const publishedAtRaw = item.isoDate || item.pubDate || null;
    const publishedAtSql = publishedAtRaw
      ? formatDateTime(new Date(publishedAtRaw))
      : formatDateTime(new Date());

    const tagsJson = JSON.stringify(item.categories || []);
    const slugBase = slugify(title);
    const slug = await ensureUniqueSlug(slugBase);

    // 4) Status logic
    let status = "draft";
    let publishedAtForInsert = null;
    if (!asDraft) {
      if (autoPublish) {
        status = "published";
        publishedAtForInsert = publishedAtSql;
      } else {
        status = "draft";
        publishedAtForInsert = null;
      }
    } else {
      status = "draft";
      publishedAtForInsert = null;
    }

    if (dryRun) {
      // SCAN-ONLY: return preview (no DB write)
      return {
        wouldInsert: true,
        preview: {
          title,
          slug,
          excerpt,
          author,
          category,
          tags: JSON.parse(tagsJson),
          featuredImage,
          status,
          publishedAt: publishedAtForInsert,
          sourceLink: originalUrl,
          externalGuid: guid,
        },
      };
    }

    // 5) IMPORT: actually insert
    const [result] = await db.execute(
      `INSERT INTO blog_posts
       (title, slug, content, excerpt, author, category, tags, featured, featured_image,
        seo_title, seo_description, external_guid, source_id, source_link,
        status, published_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        title,
        slug,
        content,
        excerpt,
        author,
        category,
        tagsJson,
        0,
        featuredImage,
        title,   // seo_title default
        excerpt, // seo_description default
        guid,
        source?.id || null,
        originalUrl || null,
        status,
        publishedAtForInsert, // NULL for drafts; timestamp if published
      ]
    );

    return { inserted: true, id: result.insertId };
  }
}

module.exports = BlogPost;
