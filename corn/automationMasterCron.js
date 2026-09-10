const cron = require("node-cron");
const db = require("../config/database");
const mailer = require("../utils/mailer");
const whatsapp = require("../integrations/whatsapp");

/**
 * Normalizes phone numbers to standard format with country code
 */
function normalizePhone(rawPhone) {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/[^\d+]/g, "").trim();
  if (digits.startsWith("+")) digits = digits.slice(1);
  // Default to India country code 91 if 10 digits
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return digits;
}

/**
 * Resolves recipient contact details from database if not already present
 */
/**
 * Resolves recipient contact details from database if not already present
 */
async function resolveRecipient(job) {
  const payload = typeof job.payload === "string" ? JSON.parse(job.payload || "{}") : (job.payload || {});
  const isExecutive = Boolean(payload.is_executive || (job.rule_id || '').toUpperCase().includes('EXECUTIVE'));

  let phone = job.recipient_phone || payload.phone || payload.recipient_phone || "";
  let email = job.recipient_email || payload.email || payload.recipient_email || "";
  let name = payload.entity_name || payload.name || "";
  let execName = "";
  let execPhone = "";
  let execEmail = "";

  // If this job is for the Executive / Agent
  if (isExecutive) {
    const assignedTo = payload.assigned_to || payload.assigned_executive || job.entity_id;
    if (assignedTo) {
      try {
        const [uRows] = await db.query(
          "SELECT id, first_name, last_name, email, phone FROM users WHERE id = ? OR username = ? LIMIT 1",
          [assignedTo, assignedTo]
        );
        if (uRows.length > 0) {
          email = email || uRows[0].email || "";
          phone = phone || uRows[0].phone || "";
          name = `${uRows[0].first_name || ""} ${uRows[0].last_name || ""}`.trim() || "Executive";
        }
      } catch (err) {
        console.warn("[AutomationCron] Executive lookup warning:", err.message);
      }
    }

    if (!email) {
      // Fallback lookup executive from lead or follow-up
      try {
        const [lRows] = await db.query(
          "SELECT u.first_name, u.last_name, u.email, u.phone FROM client_leads l JOIN users u ON u.id = l.assigned_executive WHERE l.id = ? OR l.lead_number = ? LIMIT 1",
          [job.entity_id, job.entity_id]
        );
        if (lRows.length > 0) {
          email = lRows[0].email || "";
          phone = lRows[0].phone || "";
          name = `${lRows[0].first_name || ""} ${lRows[0].last_name || ""}`.trim();
        }
      } catch {}
    }

    if (!email) {
      // Admin fallback
      try {
        const [aRows] = await db.query("SELECT first_name, last_name, email, phone FROM users WHERE role_id = 1 OR role = 'admin' LIMIT 1");
        if (aRows.length > 0) {
          email = aRows[0].email || "";
          phone = aRows[0].phone || "";
          name = `${aRows[0].first_name || ""} ${aRows[0].last_name || ""}`.trim();
        }
      } catch {}
    }

    return {
      phone: normalizePhone(phone),
      email: email.trim(),
      name: name || "Executive",
      isExecutive: true,
      executiveName: name || "Executive",
      executivePhone: normalizePhone(phone),
      executiveEmail: email.trim(),
    };
  }

  // Otherwise, this job is for the Customer (Lead / Buyer / Seller)
  const entityCode = (job.entity_code || "").toUpperCase();
  const entityId = job.entity_id;

  if (entityId) {
    try {
      let resolvedId = entityId;
      let resolvedCode = entityCode;

      if (String(entityId).startsWith("fu_")) {
        const [fuRows] = await db.query(
          "SELECT entity_code, entity_id, entity_name, entity_phone, assigned_to FROM fu_follow_ups WHERE id = ? LIMIT 1",
          [entityId]
        );
        if (fuRows.length > 0) {
          resolvedCode = (fuRows[0].entity_code || entityCode).toUpperCase();
          resolvedId = fuRows[0].entity_id || entityId;
          name = name || fuRows[0].entity_name || "";
          phone = phone || fuRows[0].entity_phone || "";
        }
      }

      if (resolvedCode === "LEAD") {
        const [rows] = await db.query(
          "SELECT l.name, l.phone, l.whatsapp_number, l.email, u.first_name AS exec_first, u.last_name AS exec_last, u.phone AS exec_phone, u.email AS exec_email FROM client_leads l LEFT JOIN users u ON u.id = l.assigned_executive WHERE l.id = ? OR l.lead_number = ? LIMIT 1",
          [resolvedId, resolvedId]
        );
        if (rows.length > 0) {
          name = name || rows[0].name || "";
          phone = phone || rows[0].whatsapp_number || rows[0].phone || "";
          email = email || rows[0].email || "";
          execName = `${rows[0].exec_first || ""} ${rows[0].exec_last || ""}`.trim();
          execPhone = rows[0].exec_phone || "";
          execEmail = rows[0].exec_email || "";
        }
      } else if (resolvedCode === "BUYER") {
        const [rows] = await db.query(
          "SELECT b.full_name, b.phone, b.whatsapp_number, b.email, u.first_name AS exec_first, u.last_name AS exec_last, u.phone AS exec_phone, u.email AS exec_email FROM buyers b LEFT JOIN users u ON u.id = b.assigned_user_id WHERE b.id = ? LIMIT 1",
          [resolvedId]
        );
        if (rows.length > 0) {
          name = name || rows[0].full_name || "";
          phone = phone || rows[0].whatsapp_number || rows[0].phone || "";
          email = email || rows[0].email || "";
          execName = `${rows[0].exec_first || ""} ${rows[0].exec_last || ""}`.trim();
          execPhone = rows[0].exec_phone || "";
          execEmail = rows[0].exec_email || "";
        }
      } else if (resolvedCode === "SELLER") {
        const [rows] = await db.query(
          "SELECT s.full_name, s.phone, s.whatsapp_number, s.email, u.first_name AS exec_first, u.last_name AS exec_last, u.phone AS exec_phone, u.email AS exec_email FROM sellers s LEFT JOIN users u ON u.id = s.assigned_user_id WHERE s.id = ? LIMIT 1",
          [resolvedId]
        );
        if (rows.length > 0) {
          name = name || rows[0].full_name || "";
          phone = phone || rows[0].whatsapp_number || rows[0].phone || "";
          email = email || rows[0].email || "";
          execName = `${rows[0].exec_first || ""} ${rows[0].exec_last || ""}`.trim();
          execPhone = rows[0].exec_phone || "";
          execEmail = rows[0].exec_email || "";
        }
      }
    } catch (lookupErr) {
      console.warn(`[AutomationCron] Contact lookup warning for ${entityCode} #${entityId}:`, lookupErr.message);
    }
  }

  return {
    phone: normalizePhone(phone),
    email: email.trim(),
    name: name || "Customer",
    isExecutive: false,
    executiveName: execName || "Resale Expert Executive",
    executivePhone: normalizePhone(execPhone) || "+91 916263982356",
    executiveEmail: execEmail.trim() || "support@hously.in",
  };
}

/**
 * Dynamically resolves and renders a template from the `templates` table or built-in rich templates.
 */
async function resolveDynamicTemplate(job, recipient, payload) {
  try {
    const channel = (job.channel || "email").toLowerCase();
    const ruleId = (job.rule_id || "").toUpperCase();
    const templateId = job.template_id;
    const isMeeting = Boolean(ruleId.includes("MEETING") || payload.type === "MEETING" || templateId === "8" || templateId === 8);
    const isExecutive = Boolean(recipient.isExecutive || payload.is_executive || ruleId.includes("EXECUTIVE"));
    const isReminder = Boolean(payload.is_reminder || ruleId.includes("REMINDER"));

    const custName = payload.customer_name || payload.entity_name || (isExecutive ? (payload.entity_ref ? String(payload.entity_ref).replace(/\s*\([^)]*\)\s*$/, '') : 'Customer') : recipient.name);
    const execName = recipient.executiveName || payload.executive_name || (isExecutive ? recipient.name : 'Resale Expert Executive');
    const execPhone = recipient.executivePhone || '+91 916263982356';
    const custPhone = payload.phone || payload.recipient_phone || (!isExecutive ? recipient.phone : '');
    const custEmail = payload.email || payload.recipient_email || (!isExecutive ? recipient.email : '');
    const propertyName = payload.project || payload.property_name || 'Discussion';
    const location = payload.location || payload.site_location || (isMeeting ? 'Office / Virtual' : 'Pune');
    const schedDate = payload.date ? `${payload.date}${payload.time ? ` at ${payload.time}` : ''}` : new Date().toLocaleDateString('en-IN');
    const siteName = 'Resale Expert';
    const year = new Date().getFullYear();

    // 1. Executive Alert / Reminder Template
    if (isExecutive) {
      const eventLabel = isMeeting ? "Meeting" : "Site Visit";
      const title = isReminder ? `${eventLabel} Reminder ⏰` : `New ${eventLabel} Assigned 📋`;
      const subject = isReminder
        ? `[Reminder] Upcoming ${eventLabel} with ${custName} on ${schedDate}`
        : `[New Appointment] ${eventLabel} with ${custName} on ${schedDate} - ${propertyName}`;

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background: #0b3856; padding: 20px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 18px; color: #ffffff;">${title}</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #93c5fd;">Resale Expert Executive Dashboard Alert</p>
          </div>
          <div style="padding: 24px; background: #ffffff;">
            <p style="margin-top: 0;">Hi <strong>${execName}</strong>,</p>
            <p>You have an ${isReminder ? 'upcoming' : 'assigned'} ${eventLabel.toLowerCase()} with the customer detailed below:</p>

            <div style="background-color: #f8fafc; border-left: 4px solid #0b3856; padding: 14px 16px; margin: 18px 0; border-radius: 6px;">
              <p style="margin: 4px 0;"><strong>👤 Customer Name:</strong> ${custName}</p>
              ${custPhone ? `<p style="margin: 4px 0;"><strong>📞 Customer Phone:</strong> <a href="tel:${custPhone}" style="color: #0b3856; font-weight: bold; text-decoration: none;">${custPhone}</a></p>` : ''}
              ${custEmail ? `<p style="margin: 4px 0;"><strong>✉️ Customer Email:</strong> <a href="mailto:${custEmail}" style="color: #0b3856; text-decoration: none;">${custEmail}</a></p>` : ''}
              <p style="margin: 4px 0;"><strong>🏢 Property / Subject:</strong> ${propertyName}</p>
              <p style="margin: 4px 0;"><strong>📍 Location:</strong> ${location}</p>
              <p style="margin: 4px 0;"><strong>📅 Scheduled Date & Time:</strong> <span style="color: #E6761D; font-weight: bold;">${schedDate}</span></p>
            </div>

            <p style="font-size: 13px; color: #475569;">Please connect with the client in advance to confirm details and be present on time.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Best regards,<br/><strong>Resale Expert Team</strong></p>
          </div>
        </div>
      `;

      return {
        template_id: isMeeting ? 'EXECUTIVE_MEETING_ALERT' : 'EXECUTIVE_SITE_VISIT_ALERT',
        template_name: `Executive ${eventLabel} Alert & Reminder`,
        subject,
        html,
        text: `${eventLabel} for ${execName} with ${custName} on ${schedDate} at ${propertyName}, ${location}. Customer Phone: ${custPhone}`,
      };
    }

    // 2. Customer Reminder Template (2h Before Visit/Meeting)
    if (isReminder) {
      const eventLabel = isMeeting ? "Meeting" : "Site Visit";
      const subject = `Reminder: Your Upcoming ${eventLabel} Today - ${propertyName}`;
      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #fed7aa; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background: #E6761D; padding: 20px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 18px; color: #ffffff;">${eventLabel} Reminder Today ⏰</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #ffedd5;">Resale Expert Appointment Alert</p>
          </div>
          <div style="padding: 24px; background: #ffffff;">
            <p style="margin-top: 0;">Dear <strong>${custName}</strong>,</p>
            <p>This is a quick friendly reminder regarding your scheduled ${eventLabel.toLowerCase()} today:</p>

            <div style="background-color: #fffaf5; border-left: 4px solid #E6761D; padding: 14px 16px; margin: 18px 0; border-radius: 6px;">
              <p style="margin: 4px 0;"><strong>🏢 Regarding:</strong> ${propertyName}</p>
              <p style="margin: 4px 0;"><strong>📍 Location / Mode:</strong> ${location}</p>
              <p style="margin: 4px 0;"><strong>📅 Scheduled Time:</strong> <span style="color: #E6761D; font-weight: bold;">${schedDate}</span></p>
              <p style="margin: 4px 0;"><strong>👤 Property Executive:</strong> ${execName} (${execPhone})</p>
            </div>

            <p style="font-size: 13px; color: #475569;">Our executive will be available to assist you. If you need directions or wish to reschedule, please call our executive directly.</p>
            <hr style="border: none; border-top: 1px solid #fed7aa; margin: 20px 0;" />
            <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Warm regards,<br/><strong>Resale Expert Team</strong><br/>${siteName}</p>
          </div>
        </div>
      `;

      return {
        template_id: isMeeting ? 'CUSTOMER_MEETING_REMINDER' : 'CUSTOMER_SITE_VISIT_REMINDER',
        template_name: `Customer ${eventLabel} Reminder`,
        subject,
        html,
        text: `Dear ${custName}, reminder for your ${eventLabel.toLowerCase()} today at ${schedDate} regarding ${propertyName}. Executive: ${execName} (${execPhone})`,
      };
    }
    // 3. Customer Immediate Confirmation Template
    let template = null;
    if (templateId) {
      const [rows] = await db.query(
        "SELECT * FROM templates WHERE (id = ? OR name = ?) AND is_active = 1 LIMIT 1",
        [templateId, templateId]
      );
      if (rows.length > 0) template = rows[0];
    }

    if (!template && isMeeting) {
      const [rows] = await db.query(
        "SELECT * FROM templates WHERE (id = 8 OR name LIKE '%Meeting%') AND channel = ? AND is_active = 1 LIMIT 1",
        [channel]
      );
      if (rows.length > 0) template = rows[0];
    }

    if (!template && (ruleId === "SITE_VISIT_EMAIL" || payload.subject?.includes("Site Visit") || payload.type === "SITE_VISIT")) {
      const [rows] = await db.query(
        "SELECT * FROM templates WHERE name LIKE '%Site Visit%Confirmation%' AND channel = ? AND is_active = 1 LIMIT 1",
        [channel]
      );
      if (rows.length > 0) template = rows[0];
    }

    if (template) {
      const firstName = custName.split(' ')[0] || custName;
      const replacer = (text) => {
        if (!text) return text;
        return text
          .replace(/\{name\}/gi, custName)
          .replace(/\{first_name\}/gi, firstName)
          .replace(/\{property_name\}/gi, propertyName)
          .replace(/\{location\}/gi, location)
          .replace(/\{date\}/gi, schedDate)
          .replace(/\{site_name\}/gi, siteName)
          .replace(/\{year\}/gi, String(year))
          .replace(/\{executive_name\}/gi, execName)
          .replace(/\{executive_phone\}/gi, execPhone);
      };

      return {
        template_id: String(template.id || template.name),
        template_name: template.name,
        subject: replacer(template.subject) || payload.subject || "Site Visit Scheduled",
        html: replacer(template.content),
        text: replacer(template.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      };
    }

    return null;
  } catch (err) {
    console.warn("[AutomationCron] Template resolution error:", err.message);
    return null;
  }
}

function startAutomationMasterCron() {
  console.log("⏰ Follow-up automation master scheduler active - polling every minute");

  cron.schedule("* * * * *", async () => {
    try {
      const nowISO = new Date().toISOString();
      // Find pending jobs ready to be processed (where scheduled_for is either past/now or not set)
      const [jobs] = await db.query(
        `SELECT * FROM \`fu_automation_jobs\`
         WHERE status IN ('PENDING', 'QUEUED')
           AND (scheduled_for IS NULL OR scheduled_for = '' OR scheduled_for <= ?)
         ORDER BY created_at ASC
         LIMIT 25`,
        [nowISO]
      );

      if (!jobs || jobs.length === 0) return;

      const nowTime = new Date();
      for (const job of jobs) {
        // Skip jobs that are scheduled for the future
        if (job.scheduled_for) {
          const schedDate = new Date(job.scheduled_for);
          if (!isNaN(schedDate.getTime()) && schedDate > nowTime) {
            continue;
          }
        }
        try {
          const payload = typeof job.payload === "string" ? JSON.parse(job.payload || "{}") : (job.payload || {});
          const recipient = await resolveRecipient(job);
          const { phone, email } = recipient;

          const channel = (job.channel || "").toUpperCase();

          // Try dynamic template resolution from Template Center
          const dynamicTpl = await resolveDynamicTemplate(job, recipient, payload);

          const subject = dynamicTpl?.subject || payload.subject || job.subject || "Follow-up Notification";
          const messageText = dynamicTpl?.text || payload.body || payload.message || job.body || "";
          const htmlContent = dynamicTpl?.html || (messageText ? `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${messageText.replace(/\n/g, "<br/>")}</div>` : "");

          if (channel === "WHATSAPP") {
            if (!phone) {
              throw new Error("No valid phone number found for recipient");
            }
            if (!messageText) {
              throw new Error("No message body provided for WhatsApp automation job");
            }

            // Send WhatsApp message
            if (typeof whatsapp.sendTextMessage === "function") {
              await whatsapp.sendTextMessage(phone, messageText);
            } else {
              console.log(`[AutomationCron] WhatsApp dispatch simulated for ${phone}: "${messageText.slice(0, 40)}..."`);
            }
          } else if (channel === "EMAIL") {
            if (!email) {
              throw new Error("No valid email address found for recipient");
            }

            // Send Email
            if (typeof mailer.sendMail === "function") {
              await mailer.sendMail({
                to: email,
                subject: subject,
                text: messageText,
                html: htmlContent,
              });
            } else {
              console.log(`[AutomationCron] Email dispatch simulated for ${email}: "${subject}"`);
            }
          } else if (channel === "MESSAGE") {
            // SMS / Generic text message
            if (!phone) {
              throw new Error("No phone number found for SMS dispatch");
            }
            console.log(`[AutomationCron] SMS message dispatched to ${phone}: "${messageText.slice(0, 40)}..."`);
          }

          // Mark job as SENT and populate template_id
          const resolvedTplId = dynamicTpl?.template_id || job.template_id || null;
          await db.query(
            `UPDATE \`fu_automation_jobs\`
             SET status = 'SENT',
                 template_id = COALESCE(?, template_id),
                 recipient_phone = COALESCE(NULLIF(?, ''), recipient_phone),
                 recipient_email = COALESCE(NULLIF(?, ''), recipient_email),
                 sent_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [resolvedTplId, phone, email, job.id]
          );

          console.log(`✅ [AutomationCron] Successfully sent ${channel} job ${job.id} for ${job.entity_code || 'ENTITY'} #${job.entity_id || ''}`);
        } catch (jobErr) {
          console.error(`❌ [AutomationCron] Job ${job.id} failed:`, jobErr.message);
          await db.query(
            `UPDATE \`fu_automation_jobs\`
             SET status = 'FAILED',
                 error_message = ?,
                 retry_count = COALESCE(retry_count, 0) + 1,
                 updated_at = NOW()
             WHERE id = ?`,
            [jobErr.message, job.id]
          );
        }
      }
    } catch (err) {
      if (err && err.code !== "ER_NO_SUCH_TABLE") {
        console.error("[AutomationCron] Execution error:", err.message);
      }
    }
  });
}

module.exports = { startAutomationMasterCron };
