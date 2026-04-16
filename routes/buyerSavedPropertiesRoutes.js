const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/buyerSavedPropertiesController");

// POST /api/buyer-saved-properties  { buyerId, propertyId, mode?: "toggle"|"save"|"unsave" }
router.post("/", ctrl.toggleSave);

// GET /api/buyer-saved-properties/:buyerId?includeProperty=true&limit=50&offset=0
router.get("/:buyerId", ctrl.listByBuyer);

// GET /api/buyer-saved-properties/check/:buyerId/:propertyId
router.get("/check/:buyerId/:propertyId", ctrl.checkSaved);

// DELETE /api/buyer-saved-properties/pair/:buyerId/:propertyId
router.delete("/pair/:buyerId/:propertyId", ctrl.removeByPair);

// DELETE /api/buyer-saved-properties/:id
router.delete("/:id", ctrl.removeById);

// GET /api/buyer-saved-properties/count/by-property/:propertyId
router.get("/count/by-property/:propertyId", ctrl.countByProperty);

router.get("/count/by-buyer/:buyerId", ctrl.countByBuyer);

module.exports = router;
