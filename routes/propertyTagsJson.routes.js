// routes/propertyTagsJson.routes.js
const express = require("express");
const ctl = require("../controllers/propertyTagsJson.controller");
const router = express.Router();

/* Collection */
router.get("/getall", ctl.getAll);           // Get all rows
router.get("/known", ctl.listKnown);           // Unique tags (for dropdowns)

/* Per property */
router.get("/:id", ctl.getById);      // Get by property id
router.put("/:id", ctl.replace);      // Replace tags
router.post("/:id/add", ctl.add);     // Add subset
router.post("/:id/remove", ctl.remove);// Remove subset
router.delete("/:id", ctl.deleteRow); // Delete row for property

/* Global tag ops */
router.delete("/tags/:tag", ctl.deleteTagEverywhere); // Delete a tag from ALL properties

module.exports = router;
