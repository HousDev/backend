const express = require("express");
const router = express.Router();
const ConnectedRemarkController = require("../controllers/ConnectedRemarkController");

// CRUD endpoints
router.post("/create", ConnectedRemarkController.create);
router.get("/get-all", ConnectedRemarkController.getAll);
router.get("/getById/:id", ConnectedRemarkController.getById);
router.put("/update/:id", ConnectedRemarkController.update);
router.delete("/delete/:id", ConnectedRemarkController.delete);
router.get('/by-tab/:tabId', ConnectedRemarkController.getByTabId);

module.exports = router;
