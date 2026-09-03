// utils/mailer.js
const nodemailer = require("nodemailer");
const Integration = require("../models/integration.model");

/**
 * Dynamically resolves SMTP configuration from database (Integrations table)
 * or falls back to process.env variables.
 */
async function getTransporter() {
  try {
    const emailIntegration = await Integration.getByTab("email");
    
    if (
      emailIntegration &&
      emailIntegration.config &&
      emailIntegration.config.host &&
      emailIntegration.config.username &&
      emailIntegration.config.password
    ) {
      const port = Number(emailIntegration.config.port || 587);
      const isSecure = port === 465;

      return {
        transporter: nodemailer.createTransport({
          host: emailIntegration.config.host,
          port: port,
          secure: isSecure,
          auth: {
            user: String(emailIntegration.config.username).trim(),
            pass: String(emailIntegration.config.password).replace(/\s+/g, ''),
          },
        }),
        fromName: emailIntegration.config.from_name || process.env.MAIL_FROM_NAME || "Resale Expert",
        fromEmail: emailIntegration.config.from_address || emailIntegration.config.username || process.env.MAIL_FROM_EMAIL,
      };
    }
  } catch (err) {
    console.warn("[Mailer] Could not load dynamic SMTP from database, using env fallback:", err.message);
  }

  // Fallback to process.env
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    MAIL_FROM_NAME,
    MAIL_FROM_EMAIL,
  } = process.env;

  return {
    transporter: nodemailer.createTransport({
      host: SMTP_HOST || "smtp.gmail.com",
      port: Number(SMTP_PORT || 587),
      secure: String(SMTP_SECURE || "false") === "true",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    }),
    fromName: MAIL_FROM_NAME || "Resale Expert",
    fromEmail: MAIL_FROM_EMAIL || SMTP_USER,
  };
}

async function sendMail({ to, subject, html, text, headers }) {
  const { transporter, fromName, fromEmail } = await getTransporter();
  const opts = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, "")?.slice(0, 1000),
    headers: headers || {},
    ...(process.env.MAIL_REPLY_TO ? { replyTo: process.env.MAIL_REPLY_TO } : {}),
  };
  return transporter.sendMail(opts);
}

/* ---------- 100% Dynamic OTP Email Template from Database ---------- */
async function getDynamicOtpEmail({ name, otpCode, companyName = "Resale Expert" }) {
  const safeName = name || "Valued User";
  const year = new Date().getFullYear().toString();
  const expiryMinutes = "10";

  try {
    const pool = require("../config/database");
    // Fetch active & approved OTP email template dynamically from DB
    const [rows] = await pool.execute(
      `SELECT subject, content FROM templates 
       WHERE channel = 'email' 
         AND (category = 'OTP' OR category = 'Security' OR name LIKE '%OTP%' OR name LIKE '%Verification%')
         AND is_active = 1 
         AND status = 'approved'
       ORDER BY updatedAt DESC LIMIT 1`
    );

    if (rows && rows.length > 0 && rows[0].content) {
      let content = rows[0].content;
      let subject = rows[0].subject || `Your Verification Code: ${otpCode} - ${companyName}`;

      const replaceMap = {
        "{otp}": otpCode,
        "{{otp}}": otpCode,
        "{otpCode}": otpCode,
        "{{otpCode}}": otpCode,
        "{name}": safeName,
        "{{name}}": safeName,
        "{first_name}": safeName.split(" ")[0] || safeName,
        "{{first_name}}": safeName.split(" ")[0] || safeName,
        "{expiry_minutes}": expiryMinutes,
        "{{expiry_minutes}}": expiryMinutes,
        "{company_name}": companyName,
        "{{company_name}}": companyName,
        "{site_name}": companyName,
        "{{site_name}}": companyName,
        "{year}": year,
        "{{year}}": year,
      };

      for (const [key, val] of Object.entries(replaceMap)) {
        content = content.split(key).join(val);
        subject = subject.split(key).join(val);
      }

      return { subject, html: content };
    }
  } catch (err) {
    console.error("[Mailer] Dynamic OTP template error:", err.message);
  }

  // Pure dynamic baseline return if template not found in DB
  return {
    subject: `Your Verification Code: ${otpCode} - ${companyName}`,
    html: `<div>Your verification code is: <b>${otpCode}</b> (Valid for ${expiryMinutes} minutes)</div>`,
  };
}

/* ---------- 100% Dynamic Signing Email Template from Database ---------- */
async function renderSigningEmail({
  name,
  documentName,
  signingUrl,
  validTill,
  companyName = "Resale Expert",
}) {
  const safeName = name || "User";
  const safeDoc = documentName || "Document";
  const year = new Date().getFullYear().toString();

  try {
    const pool = require("../config/database");
    // Fetch active & approved Signing / Agreement email template dynamically from DB
    const [rows] = await pool.execute(
      `SELECT subject, content FROM templates 
       WHERE channel = 'email' 
         AND (category = 'Signing' OR category = 'Agreement' OR name LIKE '%Signing%' OR name LIKE '%Signature%' OR name LIKE '%Agreement%')
         AND is_active = 1 
         AND status = 'approved'
       ORDER BY updatedAt DESC LIMIT 1`
    );

    if (rows && rows.length > 0 && rows[0].content) {
      let content = rows[0].content;
      let subject = rows[0].subject || `Complete your e-Signature: ${safeDoc} - ${companyName}`;

      const replaceMap = {
        "{name}": safeName,
        "{{name}}": safeName,
        "{document_name}": safeDoc,
        "{{document_name}}": safeDoc,
        "{signing_url}": signingUrl,
        "{{signing_url}}": signingUrl,
        "{valid_till}": validTill || "",
        "{{valid_till}}": validTill || "",
        "{company_name}": companyName,
        "{{company_name}}": companyName,
        "{site_name}": companyName,
        "{{site_name}}": companyName,
        "{year}": year,
        "{{year}}": year,
      };

      for (const [key, val] of Object.entries(replaceMap)) {
        content = content.split(key).join(val);
        subject = subject.split(key).join(val);
      }

      return content;
    }
  } catch (err) {
    console.error("[Mailer] Dynamic Signing template error:", err.message);
  }

  // Pure dynamic link return if template not found in DB
  return `<div><p>Hello ${safeName},</p><p>Please review and sign <b>${safeDoc}</b>: <a href="${signingUrl}">${signingUrl}</a></p></div>`;
}

module.exports = { sendMail, renderSigningEmail, getDynamicOtpEmail };
