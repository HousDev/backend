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
            pass: String(emailIntegration.config.password).replace(/\s+/g, ""),
          },
        }),
        fromName:
          emailIntegration.config.from_name ||
          process.env.MAIL_FROM_NAME ||
          "Resale Expert",
        fromEmail:
          emailIntegration.config.from_address ||
          emailIntegration.config.username ||
          process.env.MAIL_FROM_EMAIL,
      };
    }
  } catch (err) {
    console.warn(
      "[Mailer] Could not load dynamic SMTP from database, using env fallback:",
      err.message,
    );
  }

  // Fallback to process.env — ONLY if host + user + pass are fully set.
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    MAIL_FROM_NAME,
    MAIL_FROM_EMAIL,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      transporter: null,
      fromName: MAIL_FROM_NAME || "Resale Expert",
      fromEmail: MAIL_FROM_EMAIL || SMTP_USER || "",
    };
  }

  return {
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
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

  if (!transporter || !fromEmail) {
    const msg =
      "SMTP email transport is not configured in the integrations or environment. Please configure SMTP settings before sending emails.";
    console.warn(`[Mailer] ${msg}`);
    throw new Error(msg);
  }

  const opts = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text: text || html?.replace(/<[^>]+>/g, "")?.slice(0, 1000),
    headers: headers || {},
    ...(process.env.MAIL_REPLY_TO
      ? { replyTo: process.env.MAIL_REPLY_TO }
      : {}),
  };
  return transporter.sendMail(opts);
}

/* ---------- 100% Dynamic OTP Email Template from Database ---------- */
async function getDynamicOtpEmail({
  name,
  otpCode,
  companyName = "Resale Expert",
}) {
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
       ORDER BY updatedAt DESC LIMIT 1`,
    );

    if (rows && rows.length > 0 && rows[0].content) {
      let content = rows[0].content;
      let subject =
        rows[0].subject ||
        `Your Verification Code: ${otpCode} - ${companyName}`;

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

  // Pure dynamic baseline return if template not found in DB — premium fallback design
  return {
    subject: `Your Verification Code: ${otpCode} - ${companyName}`,
    html: `
      <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#f4f6f9;padding:40px 16px;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,54,88,0.08);">
          <div style="background:linear-gradient(135deg,#0E3658 0%,#164C7E 100%);padding:28px 32px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${companyName}</div>
            <div style="font-size:13px;color:#CBDCEB;margin-top:4px;">Secure Account Verification</div>
          </div>
          <div style="padding:36px 32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#111827;">Hello <b>${safeName}</b>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#4B5563;line-height:1.6;">
              Use the one-time verification code below to complete your action. This code is valid for
              <b>${expiryMinutes} minutes</b> and can only be used once.
            </p>
            <div style="background:#F0F5FB;border:1px dashed #0E3658;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
              <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0E3658;">${otpCode}</div>
            </div>
            <p style="margin:0 0 4px;font-size:13px;color:#6B7280;line-height:1.6;">
              ⚠️ For your security, never share this code with anyone, including ${companyName} staff.
            </p>
            <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.6;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </div>
          <div style="background:#F9FAFB;padding:18px 32px;text-align:center;border-top:1px solid #EEF1F5;">
            <div style="font-size:12px;color:#9CA3AF;">© ${year} ${companyName}. All rights reserved.</div>
          </div>
        </div>
      </div>
    `,
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
       ORDER BY updatedAt DESC LIMIT 1`,
    );

    if (rows && rows.length > 0 && rows[0].content) {
      let content = rows[0].content;
      let subject =
        rows[0].subject ||
        `Complete your e-Signature: ${safeDoc} - ${companyName}`;

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

  // Pure dynamic link return if template not found in DB — premium fallback design
  return `
    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#f4f6f9;padding:40px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,54,88,0.08);">
        <div style="background:linear-gradient(135deg,#0E3658 0%,#164C7E 100%);padding:28px 32px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${companyName}</div>
          <div style="font-size:13px;color:#CBDCEB;margin-top:4px;">Document Signature Request</div>
        </div>
        <div style="padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#111827;">Hello <b>${safeName}</b>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#4B5563;line-height:1.6;">
            You've been requested to review and sign the following document. Please take a moment to
            go through the details and complete your e-signature.
          </p>
          <div style="background:#F0F5FB;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
            <div style="font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Document</div>
            <div style="font-size:16px;font-weight:700;color:#0E3658;">${safeDoc}</div>
            ${
              validTill
                ? `<div style="font-size:13px;color:#6B7280;margin-top:10px;">⏳ Valid till: <b>${validTill}</b></div>`
                : ""
            }
          </div>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${signingUrl}" style="display:inline-block;background:#0E3658;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">
              Review &amp; Sign Document
            </a>
          </div>
          <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.6;word-break:break-all;">
            Or copy and paste this link into your browser:<br/>
            <a href="${signingUrl}" style="color:#0E3658;">${signingUrl}</a>
          </p>
        </div>
        <div style="background:#F9FAFB;padding:18px 32px;text-align:center;border-top:1px solid #EEF1F5;">
          <div style="font-size:12px;color:#9CA3AF;">© ${year} ${companyName}. All rights reserved.</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a vendor's services as a single, email-safe TABLE row (not flexbox —
 * flexbox is unreliable/ignored in Outlook and several mobile mail clients,
 * which is what was causing the service name and label to collapse onto the
 * same line). Up to 4 services are placed side-by-side in one row; anything
 * beyond that is summarized as "+N more services".
 */
function buildServiceGrid(services) {
  const all = Array.isArray(services) ? services.filter(Boolean) : [];
  if (!all.length) return "";

  const shown = all.slice(0, 4);
  const extraCount = all.length - shown.length;
  const colWidth = Math.floor(100 / shown.length);

  const cells = shown
    .map((s) => {
      const hasRate = s.rate !== undefined && s.rate !== null && s.rate !== "";
      const priceLine = hasRate
        ? `<div style="font-size:12.5px;color:#0E3658;font-weight:700;margin-top:5px;">₹${s.rate}${
            s.unit
              ? `<span style="color:#9CA3AF;font-weight:500;"> /${s.unit}</span>`
              : ""
          }</div>`
        : `<div style="font-size:11px;color:#9CA3AF;font-weight:500;margin-top:5px;">Contact for price</div>`;

      return `
        <td width="${colWidth}%" valign="top" style="padding:4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#F9FAFB;border:1px solid #EEF1F5;border-radius:8px;padding:12px 8px;text-align:center;">
              <div style="font-size:13px;color:#111827;font-weight:600;line-height:1.4;">
  ${s.name || "Service"}
</div>
              </td>
            </tr>
          </table>
        </td>`;
    })
    .join("");

  const moreLine =
    extraCount > 0
      ? `<div style="text-align:center;font-size:12px;color:#6B7280;margin-top:8px;">+${extraCount} more service${extraCount > 1 ? "s" : ""} available</div>`
      : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin-top:12px;">
      <tr>${cells}</tr>
    </table>
    ${moreLine}
  `;
}

async function getVendorRecommendationEmail({
  name,
  vendors,
  companyName = "Resale Expert",
  categories,
  serviceRequirements,
  message,
}) {
  const pool = require("../config/database");

  const year = new Date().getFullYear().toString();

  let rows = [];
  try {
    const [templateRows] = await pool.execute(`
      SELECT subject, content
      FROM templates
      WHERE channel='email'
        AND category='Vendor Recommendation'
        AND is_active=1
        AND status='approved'
      LIMIT 1
    `);
    rows = Array.isArray(templateRows) ? templateRows : [];
  } catch (dbErr) {
    console.warn(
      "[Mailer] getVendorRecommendationEmail template query failed, using fallback HTML:",
      dbErr?.message || dbErr,
    );
  }

  const categoryText =
    Array.isArray(categories) && categories.length
      ? categories.join(", ")
      : [
          ...new Set((vendors || []).map((v) => v.category).filter(Boolean)),
        ].join(", ");

  const requirementsText =
    Array.isArray(serviceRequirements) && serviceRequirements.length
      ? serviceRequirements.map((r) => String(r)).join("<br>• ")
      : typeof serviceRequirements === "string" && serviceRequirements.trim()
        ? serviceRequirements
        : "Your selected service requirement";

  // Premium vendor cards — table-based layout throughout (no flexbox) so
  // ranking badge, name, rating badges and the service grid render correctly
  // in every mail client, including Outlook.
  const vendorCards = (Array.isArray(vendors) ? vendors : [])
    .map((v, i) => {
      const ratingValue = Number(v.rating) || 0;
      const starDisplay =
        "★".repeat(Math.round(ratingValue)) +
        "☆".repeat(Math.max(0, 5 - Math.round(ratingValue)));

      return `
    <div style="border:1px solid #E5E7EB;border-radius:14px;padding:20px;margin-bottom:18px;background:#ffffff;box-shadow:0 2px 10px rgba(17,24,39,0.04);">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
        <tr>
          <td width="36" valign="top">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="28" height="28" style="background:#0E3658;border-radius:50%;color:#ffffff;font-size:13px;font-weight:700;text-align:center;line-height:28px;">
                  ${i + 1}
                </td>
              </tr>
            </table>
          </td>
          <td valign="top">
            <div style="font-size:17px;font-weight:700;color:#0E3658;">
              ${v.name || v.vendorName || "Vendor"}
            </div>
            <div style="font-size:13px;color:#6B7280;">
              ${v.businessName || v.companyName || v.services?.[0]?.name || "Recommended vendor"}
            </div>
          </td>
          <td width="90" valign="top" align="right">
            <span style="display:inline-block;background:#EFF6FF;color:#1D4ED8;font-size:10.5px;font-weight:700;padding:4px 8px;border-radius:999px;white-space:nowrap;">
              ✓ Verified
            </span>
          </td>
        </tr>
      </table>

      <div style="margin-bottom:12px;">
        <span style="display:inline-block;background:#F0F5FB;color:#0E3658;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-right:6px;margin-bottom:4px;">
          ${v.category || categoryText || "Service"}
        </span>
        <span style="display:inline-block;background:#FFF7E6;color:#B45309;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-right:6px;margin-bottom:4px;">
          ${starDisplay} ${v.rating || "-"}
        </span>
        <span style="display:inline-block;background:#F0FDF4;color:#166534;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:4px;">
          ${v.experience || "-"} yrs experience
        </span>
      </div>

      <table width="100%" style="font-size:14px;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#4B5563;width:90px;">📞 Phone</td>
          <td style="padding:6px 0;color:#111827;">${v.phone || "-"}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#4B5563;">✉️ Email</td>
          <td style="padding:6px 0;color:#111827;">${v.email || "-"}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#4B5563;vertical-align:top;">📍 Address</td>
          <td style="padding:6px 0;color:#111827;">${v.address || "-"}</td>
        </tr>
      </table>

      ${buildServiceGrid(v.services)}
    </div>
  `;
    })
    .join("");

  if (rows.length) {
    let subject = rows[0].subject || "Vendor Recommendation";
    let html = rows[0].content || "";

    const replaceMap = {
      "{{name}}": name || "there",
      "{{company_name}}": companyName,
      "{{categories}}": categoryText,
      "{{service_requirements}}": requirementsText,
      "{{serviceRequirements}}": requirementsText,
      "{{message}}":
        message ||
        "We are also providing other trusted vendors to compare and choose the right partner for your requirement.",
      "{{vendor_cards}}": vendorCards,
      "{{vendorCards}}": vendorCards,
      "{{year}}": year,
    };

    Object.entries(replaceMap).forEach(([k, v]) => {
      subject = String(subject).replaceAll(k, v);
      html = String(html).replaceAll(k, v);
    });

    return { subject, html };
  }

  const vendorCount = Array.isArray(vendors) ? vendors.length : 0;

  const fallbackHtml = `
    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6;background:#f4f6f9;padding:40px 16px;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,54,88,0.08);">
        <div style="background:linear-gradient(135deg,#0E3658 0%,#164C7E 100%);padding:32px;">
          <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${companyName}</div>
          <div style="font-size:14px;color:#CBDCEB;margin-top:6px;">Curated Vendor Recommendation${vendorCount ? ` · ${vendorCount} match${vendorCount > 1 ? "es" : ""} found` : ""}</div>
        </div>

        <div style="padding:32px;">
          <p style="margin:0 0 8px;font-size:15px;color:#111827;">Hello <b>${name || "there"}</b>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#4B5563;">
            Based on your requirement, our team has hand-picked the following trusted, top-rated
            service partners for you to compare and choose from.
          </p>

          <div style="background:#F0F5FB;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
            <div style="font-size:13px;color:#6B7280;margin-bottom:6px;"><b style="color:#0E3658;">Category:</b> ${categoryText}</div>
            <div style="font-size:13px;color:#6B7280;"><b style="color:#0E3658;">Requirement:</b><br>• ${requirementsText}</div>
          </div>

          <p style="margin:0 0 18px;font-size:13px;color:#6B7280;">
            ${message || "We are providing other vendors as well to help you compare and choose the right service partner for your work."}
          </p>

          <div>${vendorCards}</div>
        </div>

        <div style="background:#F9FAFB;padding:20px 32px;text-align:center;border-top:1px solid #EEF1F5;">
          <div style="font-size:12px;color:#9CA3AF;">© ${year} ${companyName}. All rights reserved.</div>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Vendor Recommendation",
    html: fallbackHtml,
  };
}

module.exports = {
  sendMail,
  renderSigningEmail,
  getDynamicOtpEmail,
  getVendorRecommendationEmail,
};
