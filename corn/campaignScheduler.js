
const cron = require("node-cron");
const db = require("../config/database");
const Campaign = require("../models/campaign.Model");
const Template = require("../models/template.Model");
const Contact = require("../models/contact.Model");
const CampaignLog = require("../models/campaignLog.Model");
const { sendTemplateMessage } = require("../integrations/whatsapp");

// Helper: Get contacts by filters
async function getContactsByFilters(filters) {
  try {
    let contacts = await Contact.findAll();
    if (!contacts || contacts.length === 0) return [];

    if (filters?.stage?.length) {
      contacts = contacts.filter((c) => filters.stage.includes(c.stage));
    }
    if (filters?.location) {
      contacts = contacts.filter((c) =>
        c.preferred_location
          ?.toLowerCase()
          .includes(filters.location.toLowerCase()),
      );
    }
    if (filters?.property_type) {
      contacts = contacts.filter(
        (c) => c.property_type === filters.property_type,
      );
    }
    if (filters?.budget_min) {
      contacts = contacts.filter(
        (c) => (c.budget_max || 0) >= filters.budget_min,
      );
    }
    if (filters?.budget_max) {
      contacts = contacts.filter(
        (c) => (c.budget_min || 0) <= filters.budget_max,
      );
    }
    if (filters?.source) {
      contacts = contacts.filter((c) => c.source === filters.source);
    }
    if (filters?.tagIds?.length) {
      contacts = contacts.filter((c) =>
        filters.tagIds.every((tagId) => c.tags?.some((t) => t.id === tagId)),
      );
    }
    return contacts;
  } catch (err) {
    console.error("Error in getContactsByFilters:", err);
    return [];
  }
}

// Helper: Get contacts by IDs
async function getContactsByIds(ids) {
  try {
    let contacts = await Contact.findAll();
    return contacts.filter((c) => ids.includes(c.id));
  } catch (err) {
    console.error("Error in getContactsByIds:", err);
    return [];
  }
}

// Main scheduler function
async function processScheduledCampaigns() {
  console.log("🕐 [CAMPAIGN CRON] Checking for scheduled campaigns...");

  try {
    const [campaigns] = await db.query(
      `SELECT * FROM campaigns 
       WHERE status = 'scheduled' 
       AND scheduled_at <= NOW() 
       AND scheduled_at IS NOT NULL`,
    );

    if (campaigns.length === 0) {
      return;
    }

    console.log(
      `📨 Found ${campaigns.length} scheduled campaign(s) to process`,
    );

    for (const campaign of campaigns) {
      console.log(
        `🚀 Launching scheduled campaign: ${campaign.id} - ${campaign.name}`,
      );

      try {
        const template = await Template.findById(campaign.template_id);
        if (!template || template.status !== "APPROVED") {
          console.log(`❌ Campaign ${campaign.id}: Template not approved`);
          await db.query(
            `UPDATE campaigns SET status = 'failed' WHERE id = ?`,
            [campaign.id],
          );
          continue;
        }

        let contacts = [];

        // ================= SEGMENT MODE =================
        if (campaign.audience_mode === "segment") {
          const filters = campaign.audience_filters || campaign.filters;
          contacts = await getContactsByFilters(filters);
          console.log(`📋 Segment mode: Found ${contacts.length} contacts`);
        }

        // ================= UPLOAD MODE =================
        else if (campaign.audience_mode === "upload") {
          const uploaded = campaign.uploaded_contacts || [];
          contacts = uploaded.map((c, index) => ({
            id: index + 1,
            name: c.name,
            phone: c.phone,
          }));
          console.log(`📋 Upload mode: Found ${contacts.length} contacts`);
        }

        // ================= MANUAL MODE - FIXED =================
        else if (campaign.audience_mode === "manual") {
          let selectedIds = campaign.selected_contact_ids || [];

          // ✅ FIX: Parse JSON string to array
          if (typeof selectedIds === "string") {
            try {
              selectedIds = JSON.parse(selectedIds);
              console.log(`📋 Parsed selected_contact_ids:`, selectedIds);
            } catch (e) {
              console.error(
                `Failed to parse selected_contact_ids for campaign ${campaign.id}:`,
                e,
              );
              selectedIds = [];
            }
          }

          // ✅ Convert string IDs to numbers (if needed)
          if (selectedIds.length) {
            const numericIds = selectedIds.map((id) =>
              typeof id === "string" ? parseInt(id) : id,
            );
            contacts = await getContactsByIds(numericIds);
            console.log(
              `📋 Manual mode: Found ${contacts.length} contacts from IDs:`,
              numericIds,
            );
          }
        }

        if (contacts.length === 0) {
          console.log(`❌ Campaign ${campaign.id}: No contacts found`);
          await db.query(
            `UPDATE campaigns SET status = 'failed' WHERE id = ?`,
            [campaign.id],
          );
          continue;
        }

        // Update campaign status to running
        await db.query(
          `UPDATE campaigns SET status = 'running', total_contacts = ? WHERE id = ?`,
          [contacts.length, campaign.id],
        );

        // Create logs for all contacts
        const contactIds = contacts.map((c) => c.id).filter((id) => id);
        if (contactIds.length > 0) {
          await CampaignLog.bulkCreate(campaign.id, contactIds);
          console.log(
            `📝 Created ${contactIds.length} logs for campaign ${campaign.id}`,
          );
        }

        // Parse template variables
        let templateVars = campaign.template_variables;
        if (typeof templateVars === "string") {
          try {
            templateVars = JSON.parse(templateVars);
          } catch (e) {
            templateVars = [];
          }
        }
        if (!templateVars || templateVars.length === 0) {
          templateVars = ["{{contact.name}}"];
        }

        console.log(`📤 Template variables:`, templateVars);

        let sent = 0,
          failed = 0;

        // Send messages to each contact
        for (const contact of contacts) {
          try {
            const variables = [];
            for (let i = 0; i < templateVars.length; i++) {
              let val = templateVars[i];
              if (val && val.includes("{{contact.")) {
                const field = val.match(/{{contact\.(\w+)}}/)?.[1];
                if (field && contact[field]) {
                  val = contact[field];
                } else {
                  val = "";
                }
              }
              variables.push(val);
            }

            const messageId = await sendTemplateMessage(
              contact.phone,
              template.name,
              template.language || "en",
              variables,
            );
            sent++;

            const log = await CampaignLog.findByContactAndCampaign(
              campaign.id,
              contact.id,
            );
            if (log) {
              await CampaignLog.updateStatus(log.id, "sent", {
                whatsapp_msg_id: messageId,
              });
            }
            await Campaign.updateStats(campaign.id, 1, 0, 0, 0);
            console.log(`✅ Sent to ${contact.phone}`);
          } catch (err) {
            failed++;
            console.error(
              `❌ Failed to send to ${contact.phone}:`,
              err.message,
            );
            await Campaign.updateStats(campaign.id, 0, 0, 0, 1);
            const log = await CampaignLog.findByContactAndCampaign(
              campaign.id,
              contact.id,
            );
            if (log) {
              await CampaignLog.updateStatus(log.id, "failed", {
                error_message: err.message,
              });
            }
          }
        }

        // Update campaign status to completed
        await db.query(
          `UPDATE campaigns SET status = 'completed' WHERE id = ?`,
          [campaign.id],
        );
        console.log(
          `✅ Campaign ${campaign.id} completed. Sent: ${sent}, Failed: ${failed}`,
        );
      } catch (err) {
        console.error(`❌ Failed to process campaign ${campaign.id}:`, err);
        await db.query(`UPDATE campaigns SET status = 'failed' WHERE id = ?`, [
          campaign.id,
        ]);
      }
    }
  } catch (err) {
    console.error("❌ Campaign scheduler error:", err);
  }
}

// Start scheduler (runs every minute)
function startCampaignScheduler() {
  cron.schedule("* * * * *", () => {
    processScheduledCampaigns();
  });
  console.log("⏰ Campaign scheduler started - checking every minute");
}

module.exports = { startCampaignScheduler, processScheduledCampaigns };