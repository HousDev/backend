const express = require("express");
const { transferToBuyer } = require("../controllers/buyerTransferController");
const router = express.Router();

// make sure you have auth middleware to set req.user if required
router.post("/transfer-to-buyer", transferToBuyer);

module.exports = router;
