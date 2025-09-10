// routes/templateRoutes.js
const express = require("express");
const ctrl = require("../controllers/templateController");

const router = express.Router();

router.get("/get-all", ctrl.list); // GET /api/templates
router.get("/get/:id", ctrl.getOne); // GET /api/templates/:id
router.post("/add", ctrl.create); // POST /api/templates
router.put("/update/:id", ctrl.update); // PUT /api/templates/:id
router.delete("/delete/:id", ctrl.remove); // DELETE /api/templates/:id

module.exports = router;
