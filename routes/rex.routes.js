// backend/routes/rex.routes.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const config = require("../config/auth.config");
const User = require("../models/User");
const rexController = require("../controllers/rex.controller");

// Middleware to optionally verify token for authenticated vs guest users
const optionalVerifyToken = async (req, res, next) => {
  let token = req.headers["x-access-token"] || req.headers["authorization"];
  if (!token) {
    req.userId = null;
    req.user = null;
    return next();
  }

  if (typeof token === "string" && token.startsWith("Bearer ")) {
    token = token.slice(7);
  }

  try {
    const decoded = jwt.verify(token, config.secret);
    if (decoded && decoded.id) {
      req.userId = decoded.id;
      const user = await User.findById(decoded.id).catch(() => null);
      if (user) {
        req.user = user;
        req.userRole = String(user.role || "").toLowerCase().trim();
      }
    }
  } catch {
    req.userId = null;
    req.user = null;
  }
  next();
};

// REX AI Agent endpoints
router.get("/sessions", optionalVerifyToken, rexController.listAllSessions);
router.get("/sessions/:sessionId", optionalVerifyToken, rexController.getSessionDetails);
router.post("/chat", optionalVerifyToken, rexController.handleChatMessage);
router.post("/action", optionalVerifyToken, rexController.handleAction);
router.post("/schedule-visit", optionalVerifyToken, rexController.handleScheduleVisit);
router.get("/session/:sessionId", optionalVerifyToken, rexController.getSessionDetails);

module.exports = router;
