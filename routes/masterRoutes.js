const express = require("express");
const router = express.Router();
const MasterController = require("../controllers/masterController");
const multer = require("multer");

const upload = multer({ dest: "uploads/" });


// Master Types Routes

router.get("/get-all/:tabId", MasterController.getAllMasterTypes);
router.get("/type/:id", MasterController.getMasterType);
router.post("/", MasterController.createMasterType);
router.put("/type/update/:id", MasterController.updateMasterType);

router.delete("/type/:id", MasterController.deleteMasterType);

// Master Values Routes
router.get("/values/:masterTypeId", MasterController.getMasterValues);
router.post("/values/:masterTypeId", MasterController.createMasterValue);
router.put("/values/:id", MasterController.updateMasterValue);
router.delete("/values/:id", MasterController.deleteMasterValue);

// Import/Export Routes
router.get("/export/:tabId", MasterController.exportMasterTypes);

router.post(
  "/import/:tabId",
  upload.single("file"),
  MasterController.importMasterTypes
);
router.get("/values/export/:masterTypeId", MasterController.exportMasterValues);
router.post(
  "/values/import/:masterTypeId",
  upload.single("file"),
  MasterController.importMasterValues
);

module.exports = router;
