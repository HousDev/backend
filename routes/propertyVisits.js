// src/routes/propertyVisits.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/propertyVisitsController");

// Parent: /api/visits
router.post("/create", ctrl.createVisit);
router.get("/get-all", ctrl.getAllVisits);
router.get("/getbyid/:visitId", ctrl.getVisitById);
router.patch("/update/:visitId", ctrl.updateVisit);
router.delete("/delete/:visitId", ctrl.deleteVisit);

// Child (nested): /api/visits/:visitId/revisits
router.post("/create-revisit/:visitId/revisits", ctrl.createRevisit);
router.get("/revisit/:visitId/revisits", ctrl.getRevisitsByVisit);

// Child (direct): /api/revisits/:revisitId
router.patch("/revisits/:revisitId", ctrl.updateRevisit);
router.delete("/revisits/:revisitId", ctrl.deleteRevisit);

module.exports = router;
