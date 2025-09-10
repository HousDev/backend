const express = require("express");
const smsController = require("../controllers/smsIntegrationController");
const { verifyToken } = require("../middleware/authJwt");

const router = express.Router();

router.post("/", verifyToken, smsController.saveSMSConfig);
router.get("/", verifyToken, smsController.getSMSConfig);
router.post("/sync", verifyToken, smsController.syncNow);
router.post("/toggle", verifyToken, smsController.toggleSMSConfig);

module.exports = router;
