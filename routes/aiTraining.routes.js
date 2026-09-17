const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const aiTrainingController = require("../controllers/aiTraining.controller");

// Setup Multer for AI training uploads
const uploadDir = path.join(__dirname, "../uploads/ai_training");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "dataset-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Routes
router.get("/stats", aiTrainingController.getTrainingStats);
router.post("/upload", upload.single("file"), aiTrainingController.uploadTrainingData);
router.post("/start-training", aiTrainingController.startTrainingRun);

module.exports = router;
