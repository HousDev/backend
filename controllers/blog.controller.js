// controllers/blog.controller.js
const BlogPost = require("../models/BlogPost");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "blog");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const buildPublicUrl = (filename) => `/uploads/blog/${filename}`;

async function resizeAndSave(filePath, maxWidth = 1400) {
  // resize using sharp in-place replacement
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
    if (!post)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const createPost = async (req, res) => {
  try {
    const body = req.body || {};

    // files
    const featuredFile = req.files?.featuredImage?.[0];
    const inlineFiles = req.files?.inlineImages || [];

    let featuredUrl = body.featuredImage || null;
    if (featuredFile) {
      // resize saved file
      await resizeAndSave(featuredFile.path).catch(() => {});
      featuredUrl = buildPublicUrl(featuredFile.filename);
    }

    const inlineUrls = [];
    for (const f of inlineFiles) {
      await resizeAndSave(f.path).catch(() => {});
      inlineUrls.push(buildPublicUrl(f.filename));
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
          ? JSON.parseSafe?.(body.tags) ||
            body.tags.split(",").map((s) => s.trim())
          : []
        : [],
      featured:
        body.featured === "1" ||
        body.featured === "true" ||
        body.featured === true,
      featuredImage: featuredUrl,
      inlineImages: inlineUrls,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      status: body.status || "draft",
    };

    // Note: simple tags handling above; if frontend sends tags as JSON string adjust accordingly
    const id = await BlogPost.create(payload);
    const created = await BlogPost.findById(id);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error("Create error", err);
    res
      .status(500)
      .json({
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
    if (!existing)
      return res.status(404).json({ success: false, message: "Not found" });

    const body = req.body || {};
    const featuredFile = req.files?.featuredImage?.[0];
    const inlineFiles = req.files?.inlineImages || [];

    let featuredUrl = existing.featuredImage;
    if (featuredFile) {
      // delete old local featured if local
      if (featuredUrl && featuredUrl.startsWith("/uploads/blog/"))
        deleteLocalFiles([featuredUrl]);
      await resizeAndSave(featuredFile.path).catch(() => {});
      featuredUrl = buildPublicUrl(featuredFile.filename);
    } else if (body.featuredImage !== undefined) {
      // explicit set/clear by frontend
      if (
        !body.featuredImage &&
        featuredUrl &&
        featuredUrl.startsWith("/uploads/blog/")
      )
        deleteLocalFiles([featuredUrl]);
      featuredUrl = body.featuredImage || null;
    }

    // inline images handling:
    // appendInline=true to append, replaceInline=true to replace (delete old local files)
    const newInlineUrls = [];
    for (const f of inlineFiles) {
      await resizeAndSave(f.path).catch(() => {});
      newInlineUrls.push(buildPublicUrl(f.filename));
    }

    let finalInline = Array.isArray(existing.inlineImages)
      ? existing.inlineImages
      : existing.inline_images
      ? JSON.parse(existing.inline_images)
      : [];
    const appendInline =
      String(body.appendInline).toLowerCase() === "true" ||
      body.appendInline === "1";
    const replaceInline =
      String(body.replaceInline).toLowerCase() === "true" ||
      body.replaceInline === "1";

    if (replaceInline) {
      // delete old local inline images
      const oldLocal = finalInline.filter(
        (u) => typeof u === "string" && u.startsWith("/uploads/blog/")
      );
      deleteLocalFiles(oldLocal);
      finalInline = newInlineUrls;
    } else if (appendInline) {
      finalInline = [...finalInline, ...newInlineUrls];
    } else {
      // default: if files uploaded then append, else if body.inlineImages provided (JSON/CSV) replace
      if (newInlineUrls.length)
        finalInline = [...finalInline, ...newInlineUrls];
      else if (body.inlineImages !== undefined) {
        try {
          const parsed =
            typeof body.inlineImages === "string"
              ? JSON.parse(body.inlineImages)
              : body.inlineImages;
          if (Array.isArray(parsed)) finalInline = parsed;
        } catch {
          /* ignore */
        }
      }
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
      inlineImages: finalInline,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription,
      status: body.status,
    };

    await BlogPost.update(id, payload);
    const updated = await BlogPost.findById(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Update error", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update",
        error: err.message,
      });
  }
};

const addInlineImages = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const files = req.files || [];
    if (!files.length)
      return res.status(400).json({ success: false, message: "No files" });
    const urls = [];
    for (const f of files) {
      await resizeAndSave(f.path).catch(() => {});
      urls.push(buildPublicUrl(f.filename));
    }
    const result = await BlogPost.addInlineImages(id, urls);
    res.json({ success: true, data: result.inlineImages });
  } catch (err) {
    console.error("Add inline error", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to add images",
        error: err.message,
      });
  }
};

const deleteInlineImages = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { imageUrls } = req.body;
    if (!Array.isArray(imageUrls) || !imageUrls.length)
      return res
        .status(400)
        .json({ success: false, message: "Provide imageUrls array" });

    // delete local physical files if any
    const local = imageUrls.filter(
      (u) => typeof u === "string" && u.startsWith("/uploads/blog/")
    );
    deleteLocalFiles(local);

    const result = await BlogPost.deleteSpecificInlineImages(id, imageUrls);
    res.json({ success: true, data: result.inlineImages });
  } catch (err) {
    console.error("Delete inline error", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete images",
        error: err.message,
      });
  }
};

const deletePost = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const post = await BlogPost.findById(id);
    if (!post)
      return res.status(404).json({ success: false, message: "Not found" });
    // delete featured + inline local files
    const filesToDelete = [];
    if (post.featuredImage && post.featuredImage.startsWith("/uploads/blog/"))
      filesToDelete.push(post.featuredImage);
    if (Array.isArray(post.inlineImages))
      filesToDelete.push(
        ...post.inlineImages.filter((u) => u.startsWith("/uploads/blog/"))
      );
    deleteLocalFiles(filesToDelete);
    await BlogPost.delete(id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("Delete post error", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete",
        error: err.message,
      });
  }
};

module.exports = {
  listPosts,
  getPost,
  createPost,
  updatePost,
  addInlineImages,
  deleteInlineImages,
  deletePost,
};
