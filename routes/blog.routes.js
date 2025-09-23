
// const express = require("express");
// const router = express.Router();
// const ctrl = require("../controllers/blog.controller");
// const { uploadBlog, handleUploadErrors } = require("../middleware/upload");


// router.get("/get-all", ctrl.listPosts);
// router.get("/get/:id", ctrl.getPost);
// router.post(
//   "/",
//   uploadBlog.single("featuredImage"),
//   handleUploadErrors,
//   ctrl.createPost
// );

// router.put(
//   "/update/:id",
//   uploadBlog.single("featuredImage"),
//   handleUploadErrors,
//   ctrl.updatePost
// );

// router.delete("/delete/:id", ctrl.deletePost);
// router.get("/:slug", ctrl.getPostBySlug);


// module.exports = router;

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/blog.controller");
const {
  uploadBlog,
  handleUploadErrors,
  attachPublicUrls,
} = require("../middleware/upload");

router.get("/get-all", ctrl.listPosts);
router.get("/get/:id", ctrl.getPost);
router.get("/:slug", ctrl.getPostBySlug);

router.post(
  "/",
  uploadBlog.single("featuredImage"),
  handleUploadErrors,
  attachPublicUrls, // <<---- NEW
  ctrl.createPost
);

router.put(
  "/update/:id",
  uploadBlog.single("featuredImage"),
  handleUploadErrors,
  attachPublicUrls, // <<---- NEW
  ctrl.updatePost
);

router.delete("/delete/:id", ctrl.deletePost);

module.exports = router;

