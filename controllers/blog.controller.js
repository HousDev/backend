// // controllers/blog.controller.js
// const BlogPost = require("../models/BlogPost");
// const path = require("path");
// const fs = require("fs");
// const sharp = require("sharp");

// const UPLOAD_DIR = path.join(process.cwd(), "uploads", "blog");
// if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// const buildPublicUrl = (filename) => `/uploads/blog/${filename}`;

// async function resizeAndSave(filePath, maxWidth = 1400) {
//   const tmpPath = `${filePath}.tmp`;
//   await sharp(filePath)
//     .resize({ width: maxWidth, withoutEnlargement: true })
//     .withMetadata(false)
//     .toFile(tmpPath);
//   await fs.promises.rename(tmpPath, filePath);
// }

// function deleteLocalFiles(paths = []) {
//   for (const p of paths) {
//     try {
//       if (!p) continue;
//       let fp = p;
//       if (p.startsWith("/")) fp = path.join(process.cwd(), p.replace(/^\/+/, ""));
//       if (fs.existsSync(fp)) fs.unlinkSync(fp);
//     } catch (err) {
//       console.warn("Failed delete", p, err.message);
//     }
//   }
// }

// const listPosts = async (req, res) => {
//   try {
//     const page = Number(req.query.page) || 1;
//     const limit = Math.min(100, Number(req.query.limit) || 20);
//     const posts = await BlogPost.findAll({
//       page,
//       limit,
//       q: req.query.q,
//       category: req.query.category,
//       status: req.query.status,
//     });
//     res.json({ success: true, data: posts });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// const getPost = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const post = await BlogPost.findById(id);
//     if (!post) return res.status(404).json({ success: false, message: "Not found" });
//     res.json({ success: true, data: post });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// const createPost = async (req, res) => {
//   try {
//     const body = req.body || {};
//     const featuredFile = req.file; // expecting uploadBlog.single('featuredImage') -> req.file

//     let featuredUrl = body.featuredImage || null;
//     if (featuredFile) {
//       await resizeAndSave(featuredFile.path).catch(() => {});
//       featuredUrl = buildPublicUrl(featuredFile.filename);
//     }

//     const payload = {
//       title: body.title,
//       content: body.content,
//       excerpt: body.excerpt,
//       author: body.author,
//       category: body.category,
//       tags: body.tags
//         ? Array.isArray(body.tags)
//           ? body.tags
//           : typeof body.tags === "string"
//           ? (() => {
//               try {
//                 return JSON.parse(body.tags);
//               } catch {
//                 return body.tags.split(",").map((s) => s.trim());
//               }
//             })()
//           : []
//         : [],
//       featured:
//         body.featured === "1" ||
//         body.featured === "true" ||
//         body.featured === true,
//       featuredImage: featuredUrl,
//       seoTitle: body.seoTitle,
//       seoDescription: body.seoDescription,
//       status: body.status || "draft",
//     };

//     const id = await BlogPost.create(payload);
//     const created = await BlogPost.findById(id);
//     res.status(201).json({ success: true, data: created });
//   } catch (err) {
//     console.error("Create error", err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to create",
//       error: err.message,
//     });
//   }
// };

// const updatePost = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const existing = await BlogPost.findById(id);
//     if (!existing) return res.status(404).json({ success: false, message: "Not found" });

//     const body = req.body || {};
//     const featuredFile = req.file; // uploadBlog.single('featuredImage')

//     let featuredUrl = existing.featuredImage;
//     if (featuredFile) {
//       if (featuredUrl && featuredUrl.startsWith("/uploads/blog/")) deleteLocalFiles([featuredUrl]);
//       await resizeAndSave(featuredFile.path).catch(() => {});
//       featuredUrl = buildPublicUrl(featuredFile.filename);
//     } else if (body.featuredImage !== undefined) {
//       if (!body.featuredImage && featuredUrl && featuredUrl.startsWith("/uploads/blog/")) deleteLocalFiles([featuredUrl]);
//       featuredUrl = body.featuredImage || null;
//     }

//     const payload = {
//       title: body.title,
//       content: body.content,
//       excerpt: body.excerpt,
//       author: body.author,
//       category: body.category,
//       tags: body.tags
//         ? Array.isArray(body.tags)
//           ? body.tags
//           : typeof body.tags === "string"
//           ? body.tags.split(",").map((s) => s.trim())
//           : []
//         : undefined,
//       featured:
//         body.featured !== undefined
//           ? body.featured === "1" ||
//             body.featured === "true" ||
//             body.featured === true
//           : undefined,
//       featuredImage: featuredUrl,
//       seoTitle: body.seoTitle,
//       seoDescription: body.seoDescription,
//       status: body.status,
//     };

//     await BlogPost.update(id, payload);
//     const updated = await BlogPost.findById(id);
//     res.json({ success: true, data: updated });
//   } catch (err) {
//     console.error("Update error", err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to update",
//       error: err.message,
//     });
//   }
// };

// const deletePost = async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const post = await BlogPost.findById(id);
//     if (!post) return res.status(404).json({ success: false, message: "Not found" });

//     // delete featured local file if present
//     const filesToDelete = [];
//     if (post.featuredImage && post.featuredImage.startsWith("/uploads/blog/"))
//       filesToDelete.push(post.featuredImage);

//     deleteLocalFiles(filesToDelete);
//     await BlogPost.delete(id);
//     res.json({ success: true, message: "Deleted" });
//   } catch (err) {
//     console.error("Delete post error", err);
//     res.status(500).json({
//       success: false,
//       message: "Failed to delete",
//       error: err.message,
//     });
//   }
// };

// // add near other handlers (e.g., getPost)
// const getPostBySlug = async (req, res) => {
//   try {
//     const slug = req.params.slug;
//     if (!slug) return res.status(400).json({ success: false, message: "Slug required" });

//     const post = await BlogPost.findBySlug(slug);
//     if (!post) return res.status(404).json({ success: false, message: "Not found" });

//     res.json({ success: true, data: post });
//   } catch (err) {
//     console.error("Get by slug error", err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// module.exports = {
//   listPosts,
//   getPost,
//   createPost,
//   updatePost,
//   deletePost,
//   getPostBySlug,
// };


// controllers/blog.controller.js
const BlogPost = require("../models/BlogPost");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

/* =========================
 *      SETUP
 * ========================= */
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "blog");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const buildPublicUrl = (filename) => `/uploads/blog/${filename}`;

async function resizeAndSave(filePath, maxWidth = 1400) {
  const tmpPath = `${filePath}.tmp`;
  await sharp(filePath)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .withMetadata(false)
    .toFile(tmpPath);
  await fs.promises.rename(tmpPath, filePath);
}

function deleteLocalFiles(paths = []) {
  for (const p of paths) {
    try {
      if (!p) continue;
      let fp = p;
      if (p.startsWith("/"))
        fp = path.join(process.cwd(), p.replace(/^\/+/, ""));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (err) {
      console.warn("Failed delete", p, err.message);
    }
  }
}

function normalizeTags(input) {
  if (!input && input !== "") return undefined;
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function shouldBeTrue(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

/* =========================
 *      PUBLIC (published-only)
 * ========================= */
const listPublicPosts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const posts = await BlogPost.findAll({
      page,
      limit,
      q: req.query.q,
      category: req.query.category,
      status: "published",
    });
    res.json({ success: true, data: posts });
  } catch (e) {
    console.error("listPublicPosts", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPublicPostBySlug = async (req, res) => {
  try {
    const post = await BlogPost.findPublishedBySlug(req.params.slug);
    if (!post)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (e) {
    console.error("getPublicPostBySlug", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =========================
 *      READ (admin/mixed)
 * ========================= */
const listPosts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(100, Number(req.query.limit) || 20);

    // ✅ Admin/editor check (either token user or dev header)
    const isAdmin =
      req.headers["x-admin"] === "1" ||
      ["admin", "editor"].includes(String(req.userRole || "").toLowerCase());

    // ✅ Sanitize query status
    const qs =
      typeof req.query.status === "string"
        ? req.query.status.trim().toLowerCase()
        : undefined;
    const allowedStatuses = new Set(["draft", "published", "archived", "scheduled"]);
    const queryStatus = qs && allowedStatuses.has(qs) ? qs : undefined;

    // ✅ Public (non-admin) → only published
    const effectiveStatus = queryStatus || (isAdmin ? undefined : "published");

    const posts = await BlogPost.findAll({
      page,
      limit,
      q: req.query.q,
      category: req.query.category,
      status: effectiveStatus,
    });

    res.json({ success: true, data: posts });
  } catch (err) {
    console.error("listPosts", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPost = async (req, res) => {
  try {
    const id = isNaN(req.params.id) ? req.params.id : Number(req.params.id);
    const post = await BlogPost.findById(id);
    if (!post)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error("getPost", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPostBySlug = async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slug)
      return res.status(400).json({ success: false, message: "Slug required" });

    const isAdmin =
      req.headers["x-admin"] === "1" ||
      ["admin", "editor"].includes(String(req.userRole || "").toLowerCase());

    const post = isAdmin
      ? await BlogPost.findBySlug(slug)
      : await BlogPost.findPublishedBySlug(slug);

    if (!post)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error("getPostBySlug", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =========================
 *      CREATE
 * ========================= */
const createPost = async (req, res) => {
  try {
    const body = req.body || {};
    const featuredFile = req.file;

    let featuredUrl = body.featuredImage || null;
    if (featuredFile) {
      await resizeAndSave(featuredFile.path).catch(() => {});
      featuredUrl = buildPublicUrl(featuredFile.filename);
    }

    const status = body.status || "draft";
    const nowISO = new Date().toISOString();

    const payload = {
      title: body.title,
      content: body.content,
      excerpt: body.excerpt,
      author: body.author,
      category: body.category,
      tags: normalizeTags(body.tags) ?? [],
      featured: shouldBeTrue(body.featured),
      featuredImage: featuredUrl,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      status,
      publishedAt:
        status === "published"
          ? body.publishedAt || body.published_at || nowISO
          : null,
      slug: body.slug,
    };

    const id = await BlogPost.create(payload);
    const created = await BlogPost.findById(id);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("Create error", err);
    res.status(500).json({
      success: false,
      message: "Failed to create",
      error: err.message,
    });
  }
};

/* =========================
 *      UPDATE
 * ========================= */
const updatePost = async (req, res) => {
  try {
    const id = isNaN(req.params.id) ? req.params.id : Number(req.params.id);
    const existing = await BlogPost.findById(id);
    if (!existing)
      return res.status(404).json({ success: false, message: "Not found" });

    const body = req.body || {};
    const featuredFile = req.file;

    // ✅ Handle featured image
    let featuredUrl = existing.featuredImage;
    if (featuredFile) {
      if (featuredUrl && featuredUrl.startsWith("/uploads/blog/"))
        deleteLocalFiles([featuredUrl]);
      await resizeAndSave(featuredFile.path).catch(() => {});
      featuredUrl = buildPublicUrl(featuredFile.filename);
    } else if (body.featuredImage !== undefined) {
      if (
        !body.featuredImage &&
        featuredUrl &&
        featuredUrl.startsWith("/uploads/blog/")
      ) {
        deleteLocalFiles([featuredUrl]);
      }
      featuredUrl = body.featuredImage || null;
    }

    // ✅ Status / publishedAt logic
    const nextStatus = body.status ?? existing.status;
    let publishedAt =
      body.publishedAt ?? body.published_at ?? existing.publishedAt ?? null;

    if (nextStatus === "published" && !publishedAt) {
      publishedAt = new Date().toISOString();
    }

    const payload = {
      title: body.title ?? existing.title,
      content: body.content ?? existing.content,
      excerpt: body.excerpt ?? existing.excerpt,
      author: body.author ?? existing.author,
      category: body.category ?? existing.category,
      tags: normalizeTags(body.tags),
      featured:
        body.featured !== undefined ? shouldBeTrue(body.featured) : undefined,
      featuredImage: featuredUrl,
      seoTitle: body.seoTitle ?? existing.seoTitle,
      seoDescription: body.seoDescription ?? existing.seoDescription,
      status: nextStatus,
      publishedAt,
      slug: body.slug,
    };

    await BlogPost.update(id, payload);
    const updated = await BlogPost.findById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Update error", err);
    res.status(500).json({
      success: false,
      message: "Failed to update",
      error: err.message,
    });
  }
};

/* =========================
 *      BULK UPDATE
 * ========================= */
const bulkUpdatePosts = async (req, res) => {
  try {
    const { ids, data } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "ids array required" });

    if (!data || typeof data !== "object")
      return res
        .status(400)
        .json({ success: false, message: "data object required" });

    const nowISO = new Date().toISOString();
    const toApply = { ...data };

    if (toApply.tags !== undefined) toApply.tags = normalizeTags(toApply.tags);
    if (toApply.featured !== undefined)
      toApply.featured = shouldBeTrue(toApply.featured);

    const nextStatus = toApply.status;
    if (nextStatus === "published" && !toApply.publishedAt && !toApply.published_at) {
      toApply.publishedAt = nowISO;
    }
    if (toApply.published_at && !toApply.publishedAt) {
      toApply.publishedAt = toApply.published_at;
      delete toApply.published_at;
    }

    const updated = [];
    for (const rawId of ids) {
      const id = isNaN(rawId) ? rawId : Number(rawId);
      const existing = await BlogPost.findById(id);
      if (!existing) continue;

      if (nextStatus === "published" && !existing.publishedAt && !toApply.publishedAt) {
        toApply.publishedAt = nowISO;
      }

      await BlogPost.update(id, toApply);
      const after = await BlogPost.findById(id);
      if (after) updated.push(after);
    }

    res.json({ success: true, data: updated, updatedCount: updated.length });
  } catch (err) {
    console.error("Bulk update error", err);
    res.status(500).json({
      success: false,
      message: "Failed bulk update",
      error: err.message,
    });
  }
};

/* =========================
 *      DELETE (single)
 * ========================= */
const deletePost = async (req, res) => {
  try {
    const id = isNaN(req.params.id) ? req.params.id : Number(req.params.id);
    const post = await BlogPost.findById(id);
    if (!post)
      return res.status(404).json({ success: false, message: "Not found" });

    const filesToDelete = [];
    if (post.featuredImage && post.featuredImage.startsWith("/uploads/blog/"))
      filesToDelete.push(post.featuredImage);

    deleteLocalFiles(filesToDelete);
    await BlogPost.delete(id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("Delete post error", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete",
      error: err.message,
    });
  }
};

/* =========================
 *      BULK DELETE
 * ========================= */
const bulkDeletePosts = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "ids array required" });

    let deletedCount = 0;
    for (const rawId of ids) {
      const id = isNaN(rawId) ? rawId : Number(rawId);
      const post = await BlogPost.findById(id);
      if (!post) continue;

      const filesToDelete = [];
      if (post.featuredImage && post.featuredImage.startsWith("/uploads/blog/"))
        filesToDelete.push(post.featuredImage);

      deleteLocalFiles(filesToDelete);
      await BlogPost.delete(id);
      deletedCount++;
    }

    res.json({ success: true, message: "Bulk delete complete", deletedCount });
  } catch (err) {
    console.error("Bulk delete error", err);
    res.status(500).json({
      success: false,
      message: "Failed bulk delete",
      error: err.message,
    });
  }
};

module.exports = {
  listPublicPosts,
  getPublicPostBySlug,
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  getPostBySlug,
  bulkUpdatePosts,
  bulkDeletePosts,
};
