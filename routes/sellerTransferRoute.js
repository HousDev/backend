// routes/sellerTransferRoute.js
const express = require("express");
const { transferToSeller } = require("../controllers/sellerTransferController");
const router = express.Router();

// add auth middleware if you need req.user
router.post("/transfer-to-seller", transferToSeller);

module.exports = router;
