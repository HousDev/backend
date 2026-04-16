const router = require("express").Router();
const { verifyWebhook, handleWebhook } = require("../integrations/whatsapp");

router.get("/", verifyWebhook);
router.post("/", handleWebhook);

module.exports = router;
