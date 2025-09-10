const express = require("express");
const {
  generateDescription,
} = require("../controllers/description.controller");

const router = express.Router();

// POST /api/generate-description
router.post("/generate-description", generateDescription);

module.exports = router;
