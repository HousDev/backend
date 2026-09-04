const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken } = require('../middleware/authJwt');

const router = express.Router();

// Apply authentication to all dashboard routes
router.use(verifyToken);

// Dashboard analytics routes
router.get('/stats', dashboardController.getDashboardStats);
router.get('/sales-performance', dashboardController.getSalesPerformance);
router.get('/lead-sources', dashboardController.getLeadSources);
router.get('/agent-performance', dashboardController.getAgentPerformance);
router.get('/property-market-analysis', dashboardController.getPropertyMarketAnalysis);
router.get('/activity-timeline', dashboardController.getActivityTimeline);
router.get('/executive-recommended-actions', dashboardController.getExecutiveRecommendedActions);
router.get('/admin-escalations', dashboardController.getAdminEscalations);

module.exports = router;