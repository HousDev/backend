const express = require("express");
const ctrl = require("../controllers/rssController");
const router = express.Router();

/* CRUD */
router.get("/", ctrl.list);
router.post("/", ctrl.create);

router.get("/validate", ctrl.validate);
router.get("/proxy", ctrl.proxy);

/* Sync/Scan/Import */
router.post("/sync-all", ctrl.syncAll); // scan all (no insert)
router.post("/:id/scan", ctrl.scanOne); // scan one (no insert)
router.post("/:id/import", ctrl.importOne); // click → import as drafts

/* Back-compat: old endpoints */
router.post("/:id/sync", ctrl.scanOne); // alias to scan (no insert)

router.patch("/:id/toggle", ctrl.toggle);

router.get("/:id", ctrl.getById);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
