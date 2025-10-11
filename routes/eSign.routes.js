const express = require("express");
const ctrl = require("../controllers/eSign.controller");
const { verifyToken } = require("../middleware/authJwt");
// const { verifyToken } = require("../middleware/authJwt");

const router = express.Router();


router.use(verifyToken);
router.post("/init",         ctrl.init);
router.post("/resend-otp",   ctrl.resendOtp);
router.post("/verify-otp",   ctrl.verifyOtp);
router.get ("/redirect-url", ctrl.getRedirectUrl);
router.get ("/status",       ctrl.status);
router.get ("/artifacts",    ctrl.artifacts);

// optional helper to simulate provider webhook
router.post("/webhook/signed", ctrl.webhookSigned);
router.get ("/session",        /* verifyToken, */ ctrl.getSession); // <-- add

module.exports = router;
