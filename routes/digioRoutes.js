const express = require("express");
const {
  healthCheck,
  authCheck,
  createSigning,
  generateLink,
  regenerateToken,
  getSigningLink,
  handleRedirect,
  handleCallback,
  getStatus,
  downloadDocument,
  cancelDocument
} = require("../controllers/digioController");

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* HEALTH & AUTH CHECK                                                        */
/* -------------------------------------------------------------------------- */

router.get("/health", healthCheck);
router.get("/auth-check", authCheck);

/* -------------------------------------------------------------------------- */
/* CREATE SIGNING                                                             */
/* -------------------------------------------------------------------------- */

router.post("/create-signing", createSigning);

/* -------------------------------------------------------------------------- */
/* GENERATE SIGNING LINK                                                      */
/* -------------------------------------------------------------------------- */

router.post("/generate-link", generateLink);

/* -------------------------------------------------------------------------- */
/* TOKEN REGENERATION                                                         */
/* -------------------------------------------------------------------------- */

router.post("/token/regenerate", regenerateToken);

/* -------------------------------------------------------------------------- */
/* GET SIGNING LINK (POST & GET)                                              */
/* -------------------------------------------------------------------------- */

router.post("/signing-link", getSigningLink);
router.get("/signing-link", getSigningLink);

/* -------------------------------------------------------------------------- */
/* REDIRECT HANDLER                                                           */
/* -------------------------------------------------------------------------- */

router.get("/redirect", handleRedirect);

/* -------------------------------------------------------------------------- */
/* CALLBACK / WEBHOOK                                                         */
/* -------------------------------------------------------------------------- */

router.post("/callback", express.json({ type: "*/*" }), handleCallback);

/* -------------------------------------------------------------------------- */
/* STATUS / DOWNLOAD / CANCEL                                                 */
/* -------------------------------------------------------------------------- */

router.get("/status/:docId", getStatus);
router.get("/download/:docId", downloadDocument);
router.delete("/cancel/:docId", cancelDocument);

module.exports = router;