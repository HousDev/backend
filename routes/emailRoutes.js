const express = require("express");
const router = express.Router();

const { sendVendorEmail } = require("../controllers/EmailController");

router.post("/send-vendor-email", sendVendorEmail);

module.exports = router;
