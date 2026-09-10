const express = require("express");
const router = express.Router();
const followUpMasterController = require("../controllers/followUpMaster.Controller");

// Get all master data for all tables
router.get("/", followUpMasterController.getAllMasterData);

// Import full module backup
router.post("/import-module", followUpMasterController.importModule);

// Delete an entire sequence by sequence name
router.delete("/sequence/:sequenceName", followUpMasterController.deleteSequence);

// Get records from a specific table
router.get("/:table", followUpMasterController.getTableData);

// Upsert (Insert or update on key conflict) a record in a table
router.post("/:table", followUpMasterController.upsertItem);

// Update a record by ID in a table
router.put("/:table/:id", followUpMasterController.updateItem);

// Delete a record by ID from a table
router.delete("/:table/:id", followUpMasterController.deleteItem);

module.exports = router;
