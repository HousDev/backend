const express = require("express");
const router = express.Router();
const workSessionController = require("../controllers/workSession.controller");
const { verifyToken } = require("../middleware/authJwt");

// Optional middleware wrapper: allow public fallback if auth header missing during dev/testing
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization) {
    return verifyToken(req, res, next);
  }
  req.userId = 1; // Default fallback for local testing
  next();
};

router.use(optionalAuth);

// Session core lifecycle routes
router.post("/start", workSessionController.startSession);
router.post("/heartbeat", workSessionController.heartbeat);
router.post("/activity", workSessionController.logActivity);
router.post("/end", workSessionController.endSession);
router.get("/current", workSessionController.getCurrentSession);
router.get("/history", workSessionController.getHistory);

// Activity verification check routes
router.post("/activity-check/start", workSessionController.startActivityCheck);
router.post("/activity-check/submit", workSessionController.submitActivityCheck);

// Smart Break routes
router.post("/break/start", workSessionController.startBreak);
router.post("/break/end", workSessionController.endBreak);
router.get("/break/history", workSessionController.getBreaksHistory);
router.get("/breaks/employee-history", workSessionController.getEmployeeBreakHistory);

// Admin / Configuration routes
router.get("/settings", workSessionController.getSettings);
router.put("/settings", workSessionController.updateSettings);

// Break Types Master Data routes
router.get("/break-types", workSessionController.getBreakTypes);
router.get("/admin/break-types", workSessionController.getAdminBreakTypes);
router.post("/admin/break-types", workSessionController.createBreakType);
router.put("/admin/break-types/:id", workSessionController.updateBreakType);
router.delete("/admin/break-types/:id", workSessionController.deleteBreakType);

// Daily Updates & Target routes
router.get("/daily-updates", workSessionController.getEmployeeDailyUpdates);
router.get("/admin/daily-updates", workSessionController.getAdminDailyUpdates);
router.post("/target", workSessionController.setEmployeeTarget);

module.exports = router;
