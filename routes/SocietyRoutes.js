// const express = require("express");
// const router = express.Router();
// const SocietyController = require("../controllers/SocietyController");

// // CRUD endpoints
// router.post("/create", SocietyController.create);
// router.get("/get-all", SocietyController.getAll);
// router.get("/getById/:id", SocietyController.getById);
// router.put("/update/:id", SocietyController.update);
// router.delete("/delete/:id", SocietyController.delete);

// // Additional endpoints
// router.post("/bulk-create", SocietyController.bulkCreate);
// router.get("/export", SocietyController.exportSocieties);
// router.post("/import", SocietyController.importSocieties);

// module.exports = router;

const express = require("express");
const router = express.Router();
const SocietyController = require("../controllers/SocietyController");

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
router.get("/export", SocietyController.exportSocieties);
router.post("/import", SocietyController.importSocieties);

module.exports = router;