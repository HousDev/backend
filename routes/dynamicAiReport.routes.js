const express = require("express");
const router = express.Router();
const dynamicAiReportController = require("../controllers/dynamicAiReportController");

// Public report generation & market summary
router.post("/generate", dynamicAiReportController.generateReport);
router.get("/market-heat", dynamicAiReportController.getMarketHeatSummary);

module.exports = router;
