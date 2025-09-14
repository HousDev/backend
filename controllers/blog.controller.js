// controllers/blog.controller.js
const BlogPost = require("../models/BlogPost");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

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
      if (p.startsWith("/")) fp = path.join(process.cwd(), p.replace(/^\/+/, ""));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch (err) {
      console.warn("Failed delete", p, err.message);
    }
  }
}

const listPosts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const posts = await BlogPost.findAll({
      page,
      limit,
      q: req.query.q,
      category: req.query.category,
      status: req.query.status,
    });
    res.json({ success: true, data: posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPost = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await BlogPost.findById(id);
    if (!post) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const createPost = async (req, res) => {
  try {
    const body = req.body || {};
    const featuredFile = req.file; // expecting uploadBlog.single('featuredImage') -> req.file

    let featuredUrl = body.featuredImage || null;
    if (featuredFile) {
      await resizeAndSave(featuredFile.path).catch(() => {});
      featuredUrl = buildPublicUrl(featuredFile.filename);
    }

    const payload = {
      title: body.title,
      content: body.content,
      excerpt: body.excerpt,
      author: body.author,
      category: body.category,
      tags: body.tags
        ? Array.isArray(body.tags)
          ? body.tags
          : typeof body.tags === "string"
          ? (() => {
              try {
                return JSON.parse(body.tags);
              } catch {
                return body.tags.split(",").map((s) => s.trim());
              }
            })()
          : []
        : [],
      featured:
        body.featured === "1" ||
        body.featured === "true" ||
        body.featured === true,
      featuredImage: featuredUrl,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      status: body.status || "draft",
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

const updatePost = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await BlogPost.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Not found" });

    const body = req.body || {};
    const featuredFile = req.file; // uploadBlog.single('featuredImage')

    let featuredUrl = existing.featuredImage;
    if (featuredFile) {
      if (featuredUrl && featuredUrl.startsWith("/uploads/blog/")) deleteLocalFiles([featuredUrl]);
      await resizeAndSave(featuredFile.path).catch(() => {});
      featuredUrl = buildPublicUrl(featuredFile.filename);
    } else if (body.featuredImage !== undefined) {
      if (!body.featuredImage && featuredUrl && featuredUrl.startsWith("/uploads/blog/")) deleteLocalFiles([featuredUrl]);
      featuredUrl = body.featuredImage || null;
    }

    const payload = {
      title: body.title,
      content: body.content,
      excerpt: body.excerpt,
      author: body.author,
      category: body.category,
      tags: body.tags
        ? Array.isArray(body.tags)
          ? body.tags
          : typeof body.tags === "string"
          ? body.tags.split(",").map((s) => s.trim())
          : []
        : undefined,
      featured:
        body.featured !== undefined
          ? body.featured === "1" ||
            body.featured === "true" ||
            body.featured === true
          : undefined,
      featuredImage: featuredUrl,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      status: body.status,
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

const deletePost = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await BlogPost.findById(id);
    if (!post) return res.status(404).json({ success: false, message: "Not found" });

    // delete featured local file if present
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

// Removed addInlineImages and deleteInlineImages handlers

module.exports = {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
};
