// routes/eSign.routes.js
const express = require("express");
const ctrl = require("../controllers/eSign.controller"); // <-- file name keep same
const { verifyToken } = require("../middleware/authJwt");

const router = express.Router();

// 🔒 protect all Aadhaar KYC routes
router.use(verifyToken);

/* ==========================================================================
   Aadhaar OTP-only KYC Flow (Sandbox or Mock)
   ========================================================================== */

// Step-1: Send Aadhaar OTP
router.post("/aadhaar/init", ctrl.init);

// Step-2: Resend Aadhaar OTP (cool-down 30s)
router.post("/aadhaar/resend-otp", ctrl.resendOtp);

// Step-3: Verify Aadhaar OTP and persist KYC snapshot
router.post("/aadhaar/verify-otp", ctrl.verifyOtp);

// Step-4: Get KYC summary for this session
router.get("/aadhaar/kyc", ctrl.getKyc);

/* ==========================================================================
   Notes:
   - No redirect, no /status, no /artifacts, no /webhook
   - Final document PDF generation handled by document controller, not here
   ========================================================================== */

module.exports = router;
