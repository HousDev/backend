// backend/routes/report.routes.js
const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { verifyToken } = require("../middleware/authJwt");

// Executive Dashboard Endpoints
router.get("/dashboard", verifyToken, reportController.getDashboardSummary);
router.get("/dashboard/trends", verifyToken, reportController.getDashboardTrends);
router.get("/dashboard/funnel", verifyToken, reportController.getDashboardFunnel);

// Detailed Domain Reports
router.get("/leads", verifyToken, reportController.getLeadReport);
router.get("/lead-sources", verifyToken, reportController.getLeadSourceReport);
router.get("/agents", verifyToken, reportController.getAgentPerformanceReport);
router.get("/agent-execution", verifyToken, reportController.getAgentLeadExecutionReport);
router.get("/buyers", verifyToken, reportController.getBuyerReport);
router.get("/sellers", verifyToken, reportController.getSellerReport);
router.get("/tenants", verifyToken, reportController.getTenantReport);
router.get("/owners", verifyToken, reportController.getOwnerReport);
router.get("/properties", verifyToken, reportController.getPropertyReport);
router.get("/property-visits", verifyToken, reportController.getPropertyVisitReport);
router.get("/transactions", verifyToken, reportController.getTransactionReport);
router.get("/activities", verifyToken, reportController.getActivityReport);
router.get("/communication", verifyToken, reportController.getCommunicationReport);
router.get("/campaigns", verifyToken, reportController.getCampaignReport);
router.get("/documents", verifyToken, reportController.getDocumentReport);
router.get("/automation", verifyToken, reportController.getAutomationReport);

// AI Insights & Export
router.get("/ai-insights", verifyToken, reportController.getAiInsights);
router.get("/export", verifyToken, reportController.exportReport);

module.exports = router;
