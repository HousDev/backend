

// controllers/razorpayController.js
const RazorpayIntegrationModal = require("../models/RazorpayIntegrationModal"); // ensure file exists
const Razorpay = require("razorpay");

/**
 * Helper to get current user id in a way compatible with your auth middleware.
 * Your authJwt.verifyToken sets req.userId, req.userRole, etc.
 * Older code may expect req.user.id so we support both.
 */
function getUserId(req) {
  // Common patterns for auth middleware
  if (req.user && (req.user.id || req.user.userId)) return req.user.id || req.user.userId;
  if (req.userId) return req.userId;
  if (req.auth && req.auth.userId) return req.auth.userId; // rare pattern
  return null;
}
// controllers/razorpayController.js (adjusted)
exports.saveConfig = async (req, res) => {
  try {
    console.log(">> Incoming /saveConfig body:", req.body);
    const userId = getUserId(req);
    console.log(">> detected userId:", userId);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // accept both camelCase and snake_case
    const keyId = req.body.keyId || req.body.key_id;
    const keySecret = req.body.keySecret || req.body.key_secret;
    const webhookSecret = req.body.webhookSecret || req.body.webhook_secret || null;
    const webhookUrl = req.body.webhookUrl || req.body.webhook_url || null;

    await RazorpayIntegrationModal.saveOrUpdateConfig(
      userId,
      String(keyId).trim(),
      keySecret ? String(keySecret).trim() : null,
      webhookSecret ? String(webhookSecret).trim() : null,
      webhookUrl ? String(webhookUrl).trim() : null
    );

    return res.json({ success: true, message: "Razorpay config saved successfully" });
  } catch (err) {
    console.error("Error saving Razorpay config:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};



exports.getConfig = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const config = await RazorpayIntegrationModal.findConfigByUser(userId);
    // do not leak secret in responses in production. Here we return for convenience.
    return res.json({ success: true, data: config || null });
  } catch (err) {
    console.error("Error fetching Razorpay config:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const { active } = req.body;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // coerce to boolean
    const isActive = !!active;
    await RazorpayIntegrationModal.toggleActiveStatus(userId, isActive);
    return res.json({ success: true, message: "Status updated successfully", is_active: isActive });
  } catch (err) {
    console.error("Error updating status:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const config = await RazorpayIntegrationModal.findConfigByUser(userId);

    if (!config || !config.key_id || !config.key_secret) {
      return res.status(400).json({ success: false, message: "Razorpay config not found for this user" });
    }

    // Create razorpay instance with user's keys
    const razorpay = new Razorpay({
      key_id: config.key_id,
      key_secret: config.key_secret,
    });

    // amount may come as string or number
    const rawAmount = req.body.amount;
    const amount = Number(rawAmount);
    if (!rawAmount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount. Provide amount > 0" });
    }

    const options = {
      amount: Math.round(amount * 100), // convert to paise (integer)
      currency: req.body.currency || "INR",
      receipt: req.body.receipt || `receipt_${Date.now()}`,
      payment_capture: typeof req.body.payment_capture !== "undefined" ? Number(req.body.payment_capture) : 1,
    };

    // create order (returns promise when callback omitted)
    const order = await razorpay.orders.create(options);
    return res.json({ success: true, order });
  } catch (err) {
    console.error("Error creating order:", err);
    // Razorpay library can return status and error details inside err; don't leak secrets though.
    return res.status(500).json({ success: false, message: "Internal Server Error", error: err.message || err });
  }
};

exports.resetIntegration = async (req, res) => {
  try {
    // defensive: ensure model is present
    if (!RazorpayIntegrationModal) {
      console.error('RazorpayIntegrationModal is not loaded in controller.');
      return res.status(500).json({ success: false, message: 'Server misconfiguration: model missing' });
    }

    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // accept id from params, body, or query
    const id = req.params?.id || req.body?.id || req.query?.id || null;

    console.log(`[Razorpay] resetIntegration called by userId=${userId} id=${id || 'ALL'}`);

    const result = await RazorpayIntegrationModal.resetIntegration(userId, id);

    if (result && result.affectedRows && result.affectedRows > 0) {
      console.log(`[Razorpay] resetIntegration success. affectedRows=${result.affectedRows}`);
      return res.json({
        success: true,
        message: id ? 'Razorpay integration deleted successfully' : 'All Razorpay integrations deleted successfully',
        affectedRows: result.affectedRows
      });
    } else {
      console.warn('[Razorpay] resetIntegration not found or not permitted', { userId, id });
      return res.status(404).json({ success: false, message: 'Integration not found or not permitted' });
    }
  } catch (err) {
    console.error('Error resetting/deleting integration:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};



// controllers/razorpayController.js (append this to your existing exports)
exports.testIntegration = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // accept id from body, query or params
    const integrationId = req.body.id || req.query.id || req.params.id || null;

    // try to fetch integration row by id (best-effort; adapt to your model API)
    // RazorpayIntegrationModal should provide a method like findIntegrationById(userId, id).
    // If not present, we fall back to findConfigByUser(userId).
    let config = null;
    if (integrationId && RazorpayIntegrationModal.findIntegrationById) {
      config = await RazorpayIntegrationModal.findIntegrationById(userId, integrationId);
    }

    if (!config) {
      // fallback to user's default config (if you store that)
      config = await RazorpayIntegrationModal.findConfigByUser(userId);
    }

    if (!config || (!config.key_id && !config.oauthToken && !config.key_secret)) {
      return res.status(400).json({ success: false, message: "Razorpay config not found for this user/integration" });
    }

    // instantiate Razorpay client
    let razorpayOptions;
    if (config.oauthToken) {
      // platform style
      razorpayOptions = { oauthToken: config.oauthToken };
    } else {
      razorpayOptions = {
        key_id: config.key_id,
        key_secret: config.key_secret,
      };
    }

    const razorpay = new Razorpay(razorpayOptions);

    // Perform a harmless read-only API call to verify credentials:
    // fetch a small list of payments (count:1). This doesn't create charges.
    // The node SDK exposes instance.payments.all(params)
    const params = { count: 1 };

    const sdkResp = await razorpay.payments.all(params);

    // Return success and the SDK response (you can return trimmed data instead)
    return res.json({
      success: true,
      message: "Razorpay test successful",
      // don't include API keys in response; sdkResp is safe
      data: sdkResp,
    });
  } catch (err) {
    console.error("Error testing Razorpay integration:", err && err.message ? err.message : err);
    // If razorpay returns 401/403-like errors they will surface here; forward a helpful message
    const statusCode = (err && err.statusCode) || 500;
    return res.status(statusCode).json({
      success: false,
      message: "Razorpay test failed",
      error: err && err.message ? err.message : String(err),
    });
  }
};





	