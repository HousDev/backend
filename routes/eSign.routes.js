const express = require("express");
const ctrl = require("../controllers/eSign.controller");
// const { verifyToken } = require("../middleware/authJwt");

const router = express.Router();

router.post("/init",        /* verifyToken, */ ctrl.init);
router.post("/resend-otp",  /* verifyToken, */ ctrl.resendOtp);
router.post("/verify-otp",  /* verifyToken, */ ctrl.verifyOtp);
router.get ("/redirect-url",/* verifyToken, */ ctrl.getRedirectUrl);
router.get ("/status",      /* verifyToken, */ ctrl.status);
router.get ("/artifacts",   /* verifyToken, */ ctrl.artifacts);

// optional helper to simulate provider webhook
router.post("/webhook/signed", ctrl.webhookSigned);
router.get ("/session",        /* verifyToken, */ ctrl.getSession); // <-- add

module.exports = router;
