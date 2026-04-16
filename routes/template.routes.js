// routes/template.routes.js
const express = require("express");
const { generateTemplate } = require("../controllers/template.Controller");

const router = express.Router();

// POST /api/ai/generate-template
router.post("/generate-template", generateTemplate);

module.exports = router;
