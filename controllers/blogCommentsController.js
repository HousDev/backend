// // controllers/blogCommentsController.js
// const BlogComment = require("../models/BlogComment");
// const db = require("../config/database");

// function sanitizeString(s, max = 5000) {
//   const str = String(s ?? "").trim();
//   return str.slice(0, max);
// }

// async function resolvePostIdBySlug(slug) {
//   try {
//     // If you have blog_posts table with slug column
//     const [rows] = await db.query(
//       `SELECT id FROM blog_posts WHERE slug = ? LIMIT 1`,
//       [slug]
//     );
//     return rows?.[0]?.id ?? null;
//   } catch {
//     return null;
//   }
// }

// exports.getCommentsBySlug = async (req, res) => {
//   try {
//     const slug = String(req.params.slug || "").trim();
//     if (!slug)
//       return res.status(400).json({ success: false, message: "Missing slug" });

//     const { limit = 100, offset = 0 } = req.query;
//     const data = await BlogComment.listBySlug(slug, {
//       status: "approved",
//       limit,
//       offset,
//     });
//     res.json({ success: true, data });
//   } catch (err) {
//     console.error("[getCommentsBySlug]", err);
//     res
//       .status(500)
//       .json({ success: false, message: "Failed to load comments" });
//   }
// };

// exports.postCommentForSlug = async (req, res) => {
//   try {
//     const slug = String(req.params.slug || "").trim();
//     if (!slug)
//       return res.status(400).json({ success: false, message: "Missing slug" });

//     const author = sanitizeString(req.body?.author ?? "", 120) || "Guest";
//     const email = sanitizeString(req.body?.email ?? "", 190) || null;
//     const content = sanitizeString(req.body?.content ?? "", 4000);

//     if (!content)
//       return res
//         .status(400)
//         .json({ success: false, message: "Content required" });

//     // Simple IP / UA capture
//     const ip =
//       (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
//       req.socket?.remoteAddress ||
//       null;
//     const ua = (req.headers["user-agent"] || "").slice(0, 250);

//     const postId = await resolvePostIdBySlug(slug); // null is okay

//     const { id } = await BlogComment.createForSlug(slug, {
//       author,
//       email,
//       content,
//       status: "approved",
//       postId,
//       ip,
//       ua,
//     });

//     res.status(201).json({
//       success: true,
//       data: {
//         id,
//         postId,
//         postSlug: slug,
//         author,
//         email,
//         content,
//         status: "approved",
//         date: new Date().toISOString(),
//       },
//     });
//   } catch (err) {
//     console.error("[postCommentForSlug]", err);
//     res.status(500).json({ success: false, message: "Failed to post comment" });
//   }
// };


// controllers/blogCommentsController.js
const BlogComment = require("../models/BlogComment");
const db = require("../config/database");

function sanitizeString(s, max = 5000) {
  const str = String(s ?? "").trim();
  return str.slice(0, max);
}

async function resolvePostIdBySlug(slug) {
  try {
    const [rows] = await db.query(
      `SELECT id FROM blog_posts WHERE slug = ? LIMIT 1`,
      [slug]
    );
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/* ----------------------------- Public APIs ----------------------------- */

exports.getCommentsBySlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug)
      return res.status(400).json({ success: false, message: "Missing slug" });

    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);

    const data = await BlogComment.listBySlug(slug, {
      status: "approved",
      limit,
      offset,
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error("[getCommentsBySlug]", err);
    res.status(500).json({ success: false, message: "Failed to load comments" });
  }
};

exports.postCommentForSlug = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug)
      return res.status(400).json({ success: false, message: "Missing slug" });

    const author = sanitizeString(req.body?.author ?? "", 120) || "Guest";
    const email = sanitizeString(req.body?.email ?? "", 190) || null;
    const content = sanitizeString(req.body?.content ?? "", 4000);

    if (!content)
      return res
        .status(400)
        .json({ success: false, message: "Content required" });

    // capture IP / UA
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      null;
    const ua = (req.headers["user-agent"] || "").slice(0, 250);

    const postId = await resolvePostIdBySlug(slug);

    // Default to approved; if you want moderation, set "unapproved" here.
    const status = "approved";

    const { id } = await BlogComment.createForSlug(slug, {
      author,
      email,
      content,
      status,
      postId,
      ip,
      ua,
    });

    res.status(201).json({
      success: true,
      data: {
        id,
        postId,
        postSlug: slug,
        author,
        email,
        content,
        status,
        date: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[postCommentForSlug]", err);
    res.status(500).json({ success: false, message: "Failed to post comment" });
  }
};

/* ------------------------ Admin / Moderation APIs ----------------------- */

/**
 * List comments with filters
 * Query:
 *  - slug?: string
 *  - status?: 'approved' | 'unapproved' | 'pending' | ...
 *  - q?: search text in author/email/content
 *  - limit?: number
 *  - offset?: number
 */
exports.adminListComments = async (req, res) => {
  try {
    const slug = sanitizeString(req.query.slug ?? "", 190) || null;
    const status = sanitizeString(req.query.status ?? "", 40) || null;
    const q = sanitizeString(req.query.q ?? "", 200) || null;
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);

    const data = await BlogComment.adminList({
      slug,
      status,
      q,
      limit,
      offset,
    });

    const total = await BlogComment.adminCount({ slug, status, q });

    res.json({ success: true, data, total });
  } catch (err) {
    console.error("[adminListComments]", err);
    res.status(500).json({ success: false, message: "Failed to list comments" });
  }
};

exports.adminGetCommentById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid id" });

    const row = await BlogComment.getById(id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    res.json({ success: true, data: row });
  } catch (err) {
    console.error("[adminGetCommentById]", err);
    res.status(500).json({ success: false, message: "Failed to get comment" });
  }
};

exports.adminUpdateCommentById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid id" });

    const payload = {
      author: req.body?.author != null ? sanitizeString(req.body.author, 120) : undefined,
      email: req.body?.email != null ? sanitizeString(req.body.email, 190) : undefined,
      content: req.body?.content != null ? sanitizeString(req.body.content, 4000) : undefined,
      status: req.body?.status != null ? sanitizeString(req.body.status, 40) : undefined, // 'approved' | 'unapproved'
    };

    const updated = await BlogComment.updateById(id, payload);
    if (!updated) return res.status(404).json({ success: false, message: "Not found" });

    const row = await BlogComment.getById(id);
    res.json({ success: true, data: row });
  } catch (err) {
    console.error("[adminUpdateCommentById]", err);
    res.status(500).json({ success: false, message: "Failed to update comment" });
  }
};

exports.adminDeleteCommentById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "Invalid id" });

    const ok = await BlogComment.deleteById(id);
    if (!ok) return res.status(404).json({ success: false, message: "Not found" });

    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("[adminDeleteCommentById]", err);
    res.status(500).json({ success: false, message: "Failed to delete comment" });
  }
};


