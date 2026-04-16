// middlewares/validateOtpSend.js
const { MSG91_COUNTRY_CODE = "91" } = process.env;

const cleanDigits = (s) => String(s || "").replace(/\D/g, "");
const normalizeMobile = (raw) => {
  const d = cleanDigits(raw);
  if (d.startsWith(MSG91_COUNTRY_CODE)) return d;
  if (d.length === 10) return MSG91_COUNTRY_CODE + d;
  return d;
};

module.exports = function validateOtpSend(req, res, next) {
  if ((req.method || "").toUpperCase() !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!req.is("application/json")) {
    return res
      .status(415)
      .json({ error: "Content-Type must be application/json" });
  }

  const { mobile } = req.body || {};
  if (!mobile) {
    return res.status(400).json({ error: "mobile is required" });
  }

  const normalized = normalizeMobile(mobile);

  // basic sanity checks (India default: 91 + 10 digits)
  if (!/^\d{12,15}$/.test(normalized)) {
    return res.status(400).json({ error: "Invalid mobile format" });
    }
    
    

  // attach normalized to request for controller
  req.normalizedMobile = normalized;
  next();
};
