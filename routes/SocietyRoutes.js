const express = require("express");
const router = express.Router();
const SocietyController = require("../controllers/SocietyController");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

// IMPORTANT: Specific routes FIRST, then generic ones
router.get(
  "/get-by-identifier/:identifier",
  SocietyController.getSocietyByIdentifier,
);
router.get("/getById/:id", SocietyController.getById);
router.get("/get-all", SocietyController.getAll);
router.post("/create", SocietyController.create);
router.put("/update/:id", SocietyController.update);
router.delete("/delete/:id", SocietyController.delete);
router.post("/bulk-create", SocietyController.bulkCreate);

// Import/Export Routes
router.get("/export", SocietyController.exportSocieties);
router.post(
  "/import",
  upload.single("file"),
  SocietyController.importSocieties,
);

module.exports = router;