const express = require("express");
const {
  createSeller,
  getSellers,
  getSellerById,
  updateSeller,
  deleteSeller,
  getPropertiesBySellerId,
  getPropertiesByAssignedTo,
} = require("../controllers/sellerController");

const router = express.Router();

router.post("/createSeller", createSeller);
router.get("/getSellers", getSellers);
router.get("/getSellerById/:id", getSellerById);
router.put("/updateSeller/:id", updateSeller);
router.delete("/deleteSeller/:id", deleteSeller);
// GET /properties/seller/123
router.get("/getPropertiesBySellerId/:sellerId", getPropertiesBySellerId);

// GET /properties/assigned/45
router.get("/getPropertiesByAssignedTo/:userId", getPropertiesByAssignedTo);

module.exports = router;
