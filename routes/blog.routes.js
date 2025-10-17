// const express = require("express");
// const router = express.Router();
// const ctrl = require("../controllers/blog.controller");
// const {
//   uploadBlog,
//   handleUploadErrors,
//   attachPublicUrls,
// } = require("../middleware/upload");
// const { verifyToken } = require("../middleware/authJwt"); // ✅ add this

// /* ---------------- Public (published-only) ---------------- */
// router.get("/public/get-all", ctrl.listPublicPosts);
// router.get("/public/:slug", ctrl.getPublicPostBySlug);

// /* ---------------- Admin / Mixed (protected) ---------------- */
// // READ
// router.get("/get-all", verifyToken, ctrl.listPosts);
// router.get("/get/:id", verifyToken, ctrl.getPost);
// router.get("/:slug", verifyToken, ctrl.getPostBySlug);

// // CREATE
// router.post(
//   "/",
//   verifyToken,
//   uploadBlog.single("featuredImage"),
//   handleUploadErrors,
//   attachPublicUrls,
//   ctrl.createPost
// );

// // UPDATE (single)
// router.put(
//   "/update/:id",
//   verifyToken,
//   uploadBlog.single("featuredImage"),
//   handleUploadErrors,
//   attachPublicUrls,
//   ctrl.updatePost
// );

// // BULK UPDATE (publish, etc.)
// router.put("/bulk-update", verifyToken, ctrl.bulkUpdatePosts);

// // BULK DELETE
// router.post("/bulk-delete", verifyToken, ctrl.bulkDeletePosts);
// router.post("/delete-many", verifyToken, ctrl.bulkDeletePosts); // alias

// // DELETE (single)
// router.delete("/delete/:id", verifyToken, ctrl.deletePost);

// module.exports = router;

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/blog.controller");
const {
  uploadBlog,
  handleUploadErrors,
  attachPublicUrls,
} = require("../middleware/upload");
const { verifyToken } = require("../middleware/authJwt");

/* ---------------- Public (published-only) ---------------- */
router.get("/public/get-all", ctrl.listPublicPosts);
router.get("/public/:slug", ctrl.getPublicPostBySlug);

/* ---------------- Admin / Mixed (protected) ---------------- */
// READ
router.get("/get-all", verifyToken, ctrl.listPosts);
router.get("/get/:id", verifyToken, ctrl.getPost);
router.get("/:slug", verifyToken, ctrl.getPostBySlug);

// CREATE
router.post(
  "/",
  verifyToken,
  uploadBlog.single("featuredImage"),
  handleUploadErrors,
  attachPublicUrls,
  ctrl.createPost
);

// UPDATE (single)
router.put(
  "/update/:id",
  verifyToken,
  uploadBlog.single("featuredImage"),
  handleUploadErrors,
  attachPublicUrls,
  ctrl.updatePost
);

// BULK UPDATE (publish, etc.)
router.put("/bulk-update", verifyToken, ctrl.bulkUpdatePosts);

// BULK DELETE
router.post("/bulk-delete", verifyToken, ctrl.bulkDeletePosts);
router.post("/delete-many", verifyToken, ctrl.bulkDeletePosts); // alias

// DELETE (single)
router.delete("/delete/:id", verifyToken, ctrl.deletePost);

module.exports = router;
