// routes/digioWebhook.js
const express = require("express");
const crypto = require("crypto");

const webhookRouter = express.Router();

/**
 * Webhook signature verification
 *
 * Digio sends POST with JSON body.
 * Header (typical): x-digio-signature (HMAC-SHA256(rawBody, GROUP_SECRET))
 *
 * NOTE: We mounted express.raw({ type: 'application/json' }) before this router in server.js
 */
webhookRouter.post("/", (req, res) => {
  try {
    const rawBody = req.body; // Buffer (because express.raw)
    const providedSig =
      req.get("x-digio-signature") ||
      req.get("X-Digio-Signature") ||
      req.get("x-signature") ||
      "";

    const expected = crypto
      .createHmac("sha256", process.env.DIGIO_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex"); // If Digio uses base64 for your account, switch to 'base64'

    const ok =
      providedSig &&
      providedSig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expected));

    if (!ok) {
      console.warn("❌ Webhook signature mismatch");
      return res.status(401).json({ ok: false });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const event = (req.get("x-digio-event") || payload?.event || "").toString();
    const digioId = req.get("x-digio-id") || payload?.id;

    // Acknowledge fast (avoid retries)
    res.status(200).json({ ok: true });

    // Process async — e.g., DB update
    // await db.execute(
    //   "UPDATE signing_requests SET status=?, callback_json=? WHERE digio_id=?",
    //   [event || payload?.status, JSON.stringify(payload), digioId]
    // );

  } catch (e) {
    console.error("Webhook error:", e);
    if (!res.headersSent) res.status(200).json({ ok: true });
  }
});

module.exports = webhookRouter;
