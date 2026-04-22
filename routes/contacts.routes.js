// const router = require("express").Router();
// const ctrl = require("../controllers/contact.Controller");

// router.get("/", ctrl.getAllContacts);
// router.get("/:id", ctrl.getContactById);
// router.post("/", ctrl.createContact);
// router.put("/:id", ctrl.updateContact);
// router.delete("/:id", ctrl.deleteContact);
// router.post("/note", ctrl.addNote);
// router.put("/pipeline", ctrl.updatePipeline);

// module.exports = router;
const router = require("express").Router();
const ctrl = require("../controllers/contact.Controller");

router.get("/", ctrl.getAllContacts);
router.get("/:id", ctrl.getContactById);
router.post("/", ctrl.createContact);
router.put("/:id", ctrl.updateContact);
router.delete("/:id", ctrl.deleteContact);
router.post("/note", ctrl.addNote);

module.exports = router;