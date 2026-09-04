// backend/services/automationEngine.js
const { sendMail } = require('../utils/mailer');
const db = require('../config/database');

/**
 * Automation Engine for Auto Email & WhatsApp Triggers
 */

async function sendWhatsAppMessage({ toPhone, textMessage, mediaUrl }) {
  try {
    const wa = require('../integrations/whatsapp');
    if (wa && typeof wa.sendTextMessage === 'function') {
      await wa.sendTextMessage(toPhone, textMessage);
      console.log(`📱 [WhatsApp Auto-Send] Sent message to ${toPhone}`);
      return true;
    }
  } catch (err) {
    console.warn(`⚠️ [WhatsApp Auto-Send Warning] Could not send via whatsapp integration:`, err.message);
  }
  return false;
}

/**
 * Helper to fetch welcome email template dynamically from DB `templates` table
 */
async function getDynamicWelcomeEmail({ entityType, name, execName, companyName }) {
  const safeName = name || 'Valued Client';
  const typeKey = String(entityType || 'lead').toLowerCase();

  try {
    const [rows] = await db.execute(
      `SELECT subject, content FROM templates 
       WHERE channel = 'email' 
         AND (
           category = 'Welcome' 
           OR category = 'Lead' 
           OR category = 'Onboarding' 
           OR LOWER(name) LIKE '%welcome%' 
           OR LOWER(name) LIKE '%lead%'
           OR LOWER(sub_category) LIKE '%welcome%'
         )
         AND is_active = 1 
         AND status = 'approved'
       ORDER BY id DESC LIMIT 1`
    );

    if (rows && rows.length > 0 && rows[0].content) {
      let content = rows[0].content;
      let subject = rows[0].subject || `Welcome to ${companyName} - Your Property Journey Begins!`;

      const executiveHtmlBlock = execName ? `
        <div style="background-color: #f0f7fc; border-left: 4px solid #0c3854; padding: 16px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; font-weight: bold; color: #0c3854;">Your Assigned Property Specialist:</p>
          <p style="margin: 4px 0 0 0; color: #e87722; font-size: 16px; font-weight: bold;">${execName}</p>
          <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Your advisor will contact you shortly.</p>
        </div>
      ` : `
        <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 16px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; color: #334155;">Our senior property specialist team has received your requirement and will connect with you shortly.</p>
        </div>
      `;

      const replaceMap = {
        "{name}": safeName,
        "{{name}}": safeName,
        "{first_name}": safeName.split(' ')[0] || safeName,
        "{{first_name}}": safeName.split(' ')[0] || safeName,
        "{execName}": execName || 'Property Specialist',
        "{{execName}}": execName || 'Property Specialist',
        "{executive_block}": executiveHtmlBlock,
        "{{executive_block}}": executiveHtmlBlock,
        "{companyName}": companyName,
        "{{companyName}}": companyName,
        "{company_name}": companyName,
        "{{company_name}}": companyName,
        "{entityType}": typeKey,
        "{{entityType}}": typeKey,
      };

      for (const [key, val] of Object.entries(replaceMap)) {
        content = content.split(key).join(val);
        subject = subject.split(key).join(val);
      }

      return { subject, html: content };
    }
  } catch (err) {
    console.error(`⚠️ [AutomationEngine] Dynamic welcome template error:`, err.message);
  }

  return null;
}

/**
 * 1. New Entity (Lead, Buyer, Seller) Welcome Trigger
 */
async function triggerWelcomeAutomation({ entityType, entityData }) {
  const { name, email, phone, whatsapp_number, assigned_executive_name, assigned_to_name } = entityData;
  const recipientEmail = email?.trim();
  const recipientPhone = (whatsapp_number || phone)?.trim();
  const execName = assigned_executive_name || assigned_to_name || null;
  const companyName = process.env.COMPANY_NAME || 'Resale Expert';
  const typeKey = String(entityType || 'lead').toLowerCase();

  console.log(`🚀 [Automation Engine] Triggering Welcome sequence for ${typeKey} (${name || 'Client'})`);

  // A. Send Auto Welcome Email
  if (recipientEmail) {
    try {
      // 1. Attempt to fetch template dynamically from Database
      const dynamicMail = await getDynamicWelcomeEmail({ entityType: typeKey, name, execName, companyName });
      
      let subject = dynamicMail?.subject;
      let htmlContent = dynamicMail?.html;

      // 2. Baseline fallback if no DB template found
      if (!htmlContent) {
        subject = `Welcome to ${companyName} - Your Property Journey Begins!`;
        let entityIntro = `Thank you for reaching out to us. We have received your inquiry.`;
        
        if (typeKey === 'buyer') {
          subject = `Welcome to ${companyName} - Let's Find Your Ideal Property!`;
          entityIntro = `Thank you for registering your property buying requirement with us. We are excited to assist you in finding your dream property.`;
        } else if (typeKey === 'seller') {
          subject = `Welcome to ${companyName} - Get the Best Resale Value for Your Property!`;
          entityIntro = `Thank you for listing your property with us. Our specialized marketing team will help you achieve the best market value.`;
        }

        const executiveHtmlBlock = execName ? `
          <div style="background-color: #f0f7fc; border-left: 4px solid #0c3854; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0; font-weight: bold; color: #0c3854;">Your Assigned Property Specialist:</p>
            <p style="margin: 4px 0 0 0; color: #e87722; font-size: 16px; font-weight: bold;">${execName}</p>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Your advisor will contact you shortly.</p>
          </div>
        ` : `
          <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 0; color: #334155;">Our senior property specialist team has received your requirement and will connect with you shortly.</p>
          </div>
        `;

        htmlContent = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <div style="background: linear-gradient(135deg, #0c3854 0%, #1e5b82 100%); color: white; padding: 28px; text-align: center;">
              <h2 style="margin: 0; font-size: 22px; font-weight: 700;">${companyName}</h2>
            </div>
            <div style="padding: 28px; color: #334155; line-height: 1.6;">
              <p style="font-size: 16px;">Dear <strong>${name || 'Valued Client'}</strong>,</p>
              <p>${entityIntro}</p>
              ${executiveHtmlBlock}
              <p>If you have any immediate questions, feel free to reply to this email.</p>
              <br/>
              <p style="margin: 0;">Warm regards,<br/><strong>Team ${companyName}</strong></p>
            </div>
          </div>
        `;
      }

      await sendMail({
        to: recipientEmail,
        subject,
        html: htmlContent,
      });
      console.log(`📧 [Auto-Email Sent] ${typeKey.toUpperCase()} Welcome email delivered to ${recipientEmail}`);
    } catch (mailErr) {
      console.error(`❌ [Auto-Email Failed] Could not send welcome email:`, mailErr.message);
    }
  }

  // B. Send Auto Welcome WhatsApp
  if (recipientPhone) {
    const waExecText = execName ? `Your dedicated advisor *${execName}* will connect with you shortly.` : `Our property specialist team will get in touch with you shortly.`;
    const waText = `Hello ${name || 'there'}! 👋 Welcome to ${companyName}.\n\nThank you for registering your ${typeKey} requirements. ${waExecText}\n\nHave a great day!`;
    await sendWhatsAppMessage({ toPhone: recipientPhone, textMessage: waText });
  }
}

/**
 * 2. Property Brochure Share Trigger (Email + WhatsApp PDF)
 */
async function triggerPropertyBrochureShare({ entityType, entityData, propertyData }) {
  const { name, email, phone, whatsapp_number } = entityData;
  const recipientEmail = email?.trim();
  const recipientPhone = (whatsapp_number || phone)?.trim();
  const propertyTitle = propertyData?.title || propertyData?.name || 'Featured Property';
  const brochureUrl = propertyData?.brochure_url || propertyData?.pdf_url || propertyData?.image_url || '';
  const companyName = process.env.COMPANY_NAME || 'Resale Expert';

  console.log(`🚀 [Automation Engine] Triggering Property Brochure Share for ${entityType} ${name} (Property: ${propertyTitle})`);

  // A. Email Brochure
  if (recipientEmail) {
    try {
      const subject = `Property Details & Brochure: ${propertyTitle}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0f172a; color: white; padding: 24px; text-align: center;">
            <h2 style="margin: 0;">${propertyTitle}</h2>
          </div>
          <div style="padding: 24px; color: #333; line-height: 1.6;">
            <p>Dear <strong>${name || 'Client'}</strong>,</p>
            <p>Here are the complete details and brochure for the property you requested:</p>
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; margin: 16px 0;">
              <h3 style="margin-top: 0; color: #0f172a;">${propertyTitle}</h3>
              <p><strong>Location:</strong> ${propertyData?.location || propertyData?.city || 'Prime Location'}</p>
              <p><strong>Price:</strong> ${propertyData?.price ? '₹' + Number(propertyData.price).toLocaleString('en-IN') : 'Contact for Price'}</p>
            </div>
            ${brochureUrl ? `<p><a href="${brochureUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Download Property Brochure PDF</a></p>` : ''}
            <br/>
            <p>Regards,<br/><strong>${companyName} Team</strong></p>
          </div>
        </div>
      `;
      await sendMail({ to: recipientEmail, subject, html: htmlContent });
      console.log(`📧 [Auto-Email Sent] Property brochure sent to ${recipientEmail}`);
    } catch (err) {
      console.error(`❌ [Auto-Email Failed] Property brochure email failed:`, err.message);
    }
  }

  // B. WhatsApp Brochure
  if (recipientPhone) {
    const waText = `Hi ${name || 'there'}, here are the details for *${propertyTitle}* 🏢\n\nLocation: ${propertyData?.location || 'Prime Location'}\nPrice: ${propertyData?.price ? '₹' + Number(propertyData.price).toLocaleString('en-IN') : 'Call for Price'}\n\n${brochureUrl ? 'Download Brochure: ' + brochureUrl : 'Contact us for photos & site visit!'}`;
    await sendWhatsAppMessage({ toPhone: recipientPhone, textMessage: waText, mediaUrl: brochureUrl });
  }
}

module.exports = {
  triggerWelcomeAutomation,
  triggerPropertyBrochureShare,
  sendWhatsAppMessage,
};
