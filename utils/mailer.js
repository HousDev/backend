// utils/mailer.js
const nodemailer = require("nodemailer");

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE,
  SMTP_USER, SMTP_PASS,
  MAIL_FROM_NAME, MAIL_FROM_EMAIL,
  MAIL_REPLY_TO,
  DKIM_DOMAIN, DKIM_SELECTOR, DKIM_PRIVATE_KEY,
} = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !MAIL_FROM_EMAIL) {
  console.warn("[Mailer] SMTP env vars missing – emails will fail if used.");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: String(SMTP_SECURE || "false") === "true",
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  ...(DKIM_DOMAIN && DKIM_SELECTOR && DKIM_PRIVATE_KEY
    ? {
        dkim: {
          domainName: DKIM_DOMAIN,
          keySelector: DKIM_SELECTOR,
          privateKey: DKIM_PRIVATE_KEY,
        },
      }
    : {}),
});

async function sendMail({ to, subject, html, text, headers }) {
  const fromName = MAIL_FROM_NAME || "No-Reply";
  const fromEmail = MAIL_FROM_EMAIL;
  const opts = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, "")?.slice(0, 1000),
    headers: headers || {},
    ...(MAIL_REPLY_TO ? { replyTo: MAIL_REPLY_TO } : {}),
  };
  return transporter.sendMail(opts);
}

/* ---------- simple signing email template ---------- */
function renderSigningEmail({
  name,
  documentName,
  signingUrl,
  validTill,           // optional
  isNewUser = false,   // show SDK/OTP note
}) {
  const safeName = name || "there";
  const safeDoc = documentName || "document";
  const expiryLine = validTill
    ? `<p style="margin:8px 0;color:#444;">Link valid till: <b>${validTill}</b></p>`
    : "";
  const otpNote = isNewUser
    ? `<p style="margin:8px 0;color:#444;">First-time user: Please verify via OTP after opening the link.</p>`
    : "";

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto;padding:16px;">
    <h2 style="margin:0 0 12px;">Complete your e-Signature</h2>
    <p style="margin:8px 0;">Hi ${safeName},</p>
    <p style="margin:8px 0;">You have a pending signature request for <b>${safeDoc}</b>.</p>
    ${expiryLine}
    ${otpNote}
    <p style="margin:16px 0;">
      <a href="${signingUrl}" style="display:inline-block;padding:12px 18px;text-decoration:none;border-radius:8px;border:1px solid #1f7aec;">
        Open Signing Link
      </a>
    </p>
    <p style="margin:8px 0;">If the button doesn’t work, copy this URL:</p>
    <p style="word-break:break-all;color:#555;">${signingUrl}</p>
    <hr style="margin:16px 0;border:none;border-top:1px solid #eee;">
    <p style="font-size:12px;color:#888;">This is an automated message from Resale Expert.</p>
  </div>`;
}

module.exports = { sendMail, renderSigningEmail };
