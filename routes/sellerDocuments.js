const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/SellerDocumentController");

router.post("/", ctrl.create);
router.get("/seller/:sellerId", ctrl.listBySeller);
router.get("/getById/:id", ctrl.getById);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
