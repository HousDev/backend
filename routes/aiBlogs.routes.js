// routes/aiBlog.routes.js
const express = require("express");
const { generateBlogFromTitle } = require("../controllers/aiBlogs.controller");

const router = express.Router();

// POST /api/ai/blogs/generate
router.post("/generate", generateBlogFromTitle);

module.exports = router;
