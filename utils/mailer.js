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

/* ---------- 6-Digit OTP Email Template ---------- */
function renderOtpEmail({ name, otpCode, companyName = "Resale Expert" }) {
  const safeName = name || "Valued User";
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Verification Code</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f7fa; padding: 30px 15px;">
      <tr>
        <td align="center">
          <table width="100%" max-width="580" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); border: 1px solid #eef2f6;">
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #1a3a5c 0%, #0e2439 100%); padding: 32px 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
                  ${companyName}
                </h1>
                <p style="color: rgba(255, 255, 255, 0.7); margin: 6px 0 0; font-size: 13px;">
                  Email Verification Code
                </p>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td style="padding: 32px 28px;">
                <p style="color: #2d3748; font-size: 15px; margin: 0 0 16px; font-weight: 600;">
                  Hello ${safeName},
                </p>
                <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                  Thank you for registering with <strong>${companyName}</strong>. Please use the verification code below to verify your email address and activate your account.
                </p>

                <!-- OTP Box -->
                <div style="background: #fff8f3; border: 2px dashed #e87722; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
                  <span style="display: block; font-size: 12px; text-transform: uppercase; font-weight: 700; color: #718096; letter-spacing: 1px; margin-bottom: 8px;">
                    Your One-Time Password (OTP)
                  </span>
                  <div style="font-size: 36px; font-weight: 800; color: #e87722; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                    ${otpCode}
                  </div>
                  <span style="display: block; font-size: 12px; color: #a0aec0; margin-top: 8px;">
                    ⏱️ Code valid for <strong>10 minutes</strong>
                  </span>
                </div>

                <div style="background-color: #f7fafc; border-left: 4px solid #1a3a5c; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px;">
                  <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0;">
                    <strong>Security Notice:</strong> Never share this code with anyone. Our support team will never ask for your verification code.
                  </p>
                </div>

                <p style="color: #718096; font-size: 13px; margin: 0; line-height: 1.5;">
                  If you didn't request this verification code, please disregard this email.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #edf2f7;">
                <p style="color: #a0aec0; font-size: 11px; margin: 0;">
                  © ${new Date().getFullYear()} ${companyName}. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

/* ---------- simple signing email template ---------- */
function renderSigningEmail({
  name,
  documentName,
  signingUrl,
  validTill,
  isNewUser = false,
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

module.exports = { sendMail, renderSigningEmail, renderOtpEmail };
