// routes/smsRoutes.js
const { Router } = require("express");
const { otpSend } = require("../controllers/smsController");
const validateOtpSend = require("../middleware/validateOtpSend");

const router = Router();

// POST-only, with payload/content-type validation
router.post("/otp/send", validateOtpSend, otpSend);

module.exports = router;
