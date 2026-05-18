// routes/backup.routes.js
"use strict";

const express    = require("express");
const router     = express.Router();
const ctrl       = require("../controllers/backupController");

/*
  Mount in server.js / app.js:
    const backupRoutes = require("./routes/backup.routes");
    app.use("/api/backup", backupRoutes);

  Endpoints:
    POST   /api/backup/import/:entity           ← upload file → inserts into entity table
    GET    /api/backup/export/:entity?format=   ← export entity table → file download
    GET    /api/backup/template/:entity?format= ← blank template download
    GET    /api/backup/history                  ← paginated history
    GET    /api/backup/stats                    ← summary counts
    DELETE /api/backup/history/:id             ← delete log row
*/

router.post("/import/:entity",  ctrl.uploadMiddleware, ctrl.importData);
router.get("/export/:entity",   ctrl.exportData);
router.get("/template/:entity", ctrl.downloadTemplate);
router.get("/history",          ctrl.getHistory);
router.get("/stats",            ctrl.getStats);
router.delete("/history/:id",   ctrl.deleteHistory);

module.exports = router;