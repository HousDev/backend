// routes/blog.routes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/blog.controller");
const { uploadBlog, handleUploadErrors } = require("../middleware/upload");

// list & query
router.get("/get-all", ctrl.listPosts);

// get single
router.get("/get/:id", ctrl.getPost);

// create (supports featuredImage + inlineImages)
router.post(
  "/",
  uploadBlog.fields([
    { name: "featuredImage", maxCount: 1 },
    { name: "inlineImages", maxCount: 20 }, // change maxCount as needed
  ]),
  handleUploadErrors,
  ctrl.createPost
);

// update
router.put(
  "/update/:id",
  uploadBlog.fields([
    { name: "featuredImage", maxCount: 1 },
    { name: "inlineImages", maxCount: 20 },
  ]),
  handleUploadErrors,
  ctrl.updatePost
);
// delete post
router.delete("/delete/:id", ctrl.deletePost);

// append inline images only
router.post(
  "/:id/inline-images",
  uploadBlog.array("inlineImages", 20),
  handleUploadErrors,
  ctrl.addInlineImages
);

// delete selected inline images
router.post("/:id/inline-images/delete", ctrl.deleteInlineImages);



module.exports = router;
