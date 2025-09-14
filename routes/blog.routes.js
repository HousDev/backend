
// routes/blog.routes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/blog.controller");
const { uploadBlog, handleUploadErrors } = require("../middleware/upload");

// list & query
router.get("/get-all", ctrl.listPosts);

// get single
router.get("/get/:id", ctrl.getPost);

// create (supports only featuredImage now)
router.post(
  "/",
  uploadBlog.single("featuredImage"),
  handleUploadErrors,
  ctrl.createPost
);

// update (supports only featuredImage)
router.put(
  "/update/:id",
  uploadBlog.single("featuredImage"),
  handleUploadErrors,
  ctrl.updatePost
);

// delete post
router.delete("/delete/:id", ctrl.deletePost);
router.get("/:slug", ctrl.getPostBySlug);


module.exports = router;
