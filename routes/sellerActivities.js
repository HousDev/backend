const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/SellerActivityController");

router.post("/create", ctrl.create);
router.get("/seller/:sellerId", ctrl.listBySeller);
router.get("/getById/:id", ctrl.getById);
router.put("/update/:id", ctrl.update);
router.delete("/delete/:id", ctrl.remove);

module.exports = router;
