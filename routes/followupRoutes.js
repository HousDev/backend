const express = require("express");
const {
  createFollowup,
  getFollowups,
  getFollowupById,
  updateFollowup,
  deleteFollowup,
  getFollowupsByLeadId,
  getFollowupsCountByLeadId,
} = require("../controllers/followupController");

const { authJwt } = require("../middleware"); // ✅ auth middleware import
const router = express.Router();

// Protected Routes (Auth Required)
router.post("/create", authJwt.verifyToken, createFollowup);         // Create
router.get("/get-all", authJwt.verifyToken, getFollowups);           // Get all
router.get("/getById/:id", authJwt.verifyToken, getFollowupById);    // Get one
router.put("/update/:id", authJwt.verifyToken, updateFollowup);      // Update
router.delete("/delete/:id", authJwt.verifyToken, deleteFollowup);   // Delete
router.get("/getByLeadId/:leadId", authJwt.verifyToken, getFollowupsByLeadId); // Get by lead ID
router.get("/countByLeadId/:leadId", authJwt.verifyToken, getFollowupsCountByLeadId); // Get count by lead ID

module.exports = router;
