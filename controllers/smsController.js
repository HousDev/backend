// controllers/smsController.js
const https = require("https");
const OtpSendLog = require("../models/OtpSendLog");

const {
  MSG91_AUTHKEY = "YOUR_AUTH_KEY",
  MSG91_FLOW_OTP_TEMPLATE_ID = "YOUR_TEMPLATE_ID",
  SHOW_OTP_IN_RESPONSE = "FALSE",
} = process.env;

function postJson({ hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const opts = {
      method: "POST",
      hostname,
      path,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {}
        resolve({ status: res.statusCode, text: data, json });
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body || {}));
    req.end();
  });
}

exports.otpSend = async (req, res) => {
  // mobile already validated & normalized by middleware
  const mobile = req.normalizedMobile;

  try {
    if (!MSG91_AUTHKEY || !MSG91_FLOW_OTP_TEMPLATE_ID) {
      return res.status(500).json({ error: "MSG91 env not configured" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const payload = {
      template_id: MSG91_FLOW_OTP_TEMPLATE_ID,
      recipients: [
        {
          mobiles: mobile,
          OTP: otp, // Template must have {{OTP}}
        },
      ],
    };

    const msg = await postJson({
      hostname: "control.msg91.com",
      path: "/api/v5/flow",
      headers: { authkey: MSG91_AUTHKEY },
      body: payload,
    });

    // log attempt
    await OtpSendLog.create({
      mobile,
      payload,
      response_status: msg.status,
      response_json: msg.json || { text: msg.text },
      error_message:
        msg.status >= 200 && msg.status < 300
          ? null
          : msg.json?.message || msg.text || "MSG91 error",
    });

    if (msg.status < 200 || msg.status >= 300) {
      return res.status(502).json({
        success: false,
        error: "MSG91 send failed",
        detail: msg.json || msg.text,
      });
    }

    return res.json({
      success: true,
      message: "OTP sent",
      mobile,
      ...(String(SHOW_OTP_IN_RESPONSE).toUpperCase() === "TRUE" ? { otp } : {}),
    });
  } catch (err) {
    console.error("otpSend error:", err);
    // best-effort log
    try {
      await OtpSendLog.create({
        mobile,
        payload: null,
        response_status: null,
        response_json: null,
        error_message: String(err?.message || err),
      });
    } catch (_) {}
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
