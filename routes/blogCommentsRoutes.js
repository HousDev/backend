// // routes/blogCommentsRoutes.js
// const express = require("express");
// const {
//   getCommentsBySlug,
//   postCommentForSlug,
// } = require("../controllers/blogCommentsController");

// const router = express.Router();

// /**
//  * Public comments APIs
//  * GET  /api/public/blogs/:slug/comments  -> list
//  * POST /api/public/blogs/:slug/comments  -> create
//  */
// router.get("/public/blogs/:slug/comments", getCommentsBySlug);
// router.post("/public/blogs/:slug/comments", postCommentForSlug);

// module.exports = router;



// routes/blogCommentsRoutes.js
const express = require("express");
const {
  // public
  getCommentsBySlug,
  postCommentForSlug,
  // admin / internal
  adminListComments,
  adminGetCommentById,
  adminUpdateCommentById,
  adminDeleteCommentById,
 
} = require("../controllers/blogCommentsController");

const router = express.Router();

/**
 * Public comments APIs
 * GET  /api/public/blogs/:slug/comments  -> list (approved only)
 * POST /api/public/blogs/:slug/comments  -> create (auto-approved or pending as per controller)
 */
router.get("/public/blogs/:slug/comments", getCommentsBySlug);
router.post("/public/blogs/:slug/comments", postCommentForSlug);

/**
 * Admin / internal moderation APIs
 * You can mount these under /api for internal dashboard use.
 * Feel free to protect with your auth middleware (not added here to keep your structure unchanged).
 *
 * GET    /api/blog-comments                 -> list with filters (slug, status, q)
 * GET    /api/blog-comments/:id             -> single
 * PATCH  /api/blog-comments/:id             -> edit (author, email, content, status)
 * DELETE /api/blog-comments/:id             -> delete

 */
router.get("/blog-comments", adminListComments);
router.get("/blog-comments/:id", adminGetCommentById);
router.patch("/blog-comments/:id", adminUpdateCommentById);
router.delete("/blog-comments/:id", adminDeleteCommentById);


module.exports = router;
