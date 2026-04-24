// const Campaign = require("../models/campaign.Model");
// const CampaignLog = require("../models/campaignLog.Model");
// const Contact = require("../models/contact.Model");
// const Template = require("../models/template.Model");
// const { sendTemplateMessage } = require("../integrations/whatsapp");

// // Get all campaigns
// exports.getAllCampaigns = async (req, res) => {
//   try {
//     const campaigns = await Campaign.findAll();
//     res.json(campaigns);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get campaign by ID
// exports.getCampaignById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const campaign = await Campaign.findById(id);
//     if (!campaign) {
//       return res.status(404).json({ error: "Campaign not found" });
//     }
//     res.json(campaign);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Create campaign
// exports.createCampaign = async (req, res) => {
//   try {
//     const campaignData = req.body;

//     // Validate template exists and is approved
//     if (campaignData.template_id) {
//       const template = await Template.findById(campaignData.template_id);
//       if (!template) {
//         return res.status(400).json({ error: "Template not found" });
//       }
//       if (template.status !== "APPROVED") {
//         return res
//           .status(400)
//           .json({ error: "Template must be approved to create campaign" });
//       }
//     }

//     const id = await Campaign.create(campaignData);
//     const newCampaign = await Campaign.findById(id);
//     res.status(201).json(newCampaign);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Update campaign
// exports.updateCampaign = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const existing = await Campaign.findById(id);
//     if (!existing) {
//       return res.status(404).json({ error: "Campaign not found" });
//     }

//     const updated = await Campaign.update(id, req.body);
//     res.json(updated);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Delete campaign
// exports.deleteCampaign = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const existing = await Campaign.findById(id);
//     if (!existing) {
//       return res.status(404).json({ error: "Campaign not found" });
//     }

//     await Campaign.delete(id);
//     res.json({ success: true, message: "Campaign deleted" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Launch campaign
// exports.launchCampaign = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const campaign = await Campaign.findById(id);

//     if (!campaign) {
//       return res.status(404).json({ error: "Campaign not found" });
//     }

//     if (campaign.status !== "draft" && campaign.status !== "paused") {
//       return res.status(400).json({ error: "Campaign cannot be launched" });
//     }

//     // Get template
//     const template = await Template.findById(campaign.template_id);
//     if (!template || template.status !== "APPROVED") {
//       return res.status(400).json({ error: "Template not approved" });
//     }

//     // Get contacts based on audience mode
//     let contacts = [];

//     if (campaign.audience_mode === "segment") {
//       // Apply filters to get contacts
//       const filters = campaign.audience_filters || campaign.filters;
//       contacts = await getContactsByFilters(filters);
//     } else if (campaign.audience_mode === "upload") {
//       // Use uploaded contacts
//       const uploaded = campaign.uploaded_contacts || [];
//       contacts = uploaded;
//     } else if (campaign.audience_mode === "manual") {
//       // Use manually selected contact IDs
//       const selectedIds = campaign.selected_contact_ids || [];
//       if (selectedIds.length) {
//         contacts = await getContactsByIds(selectedIds);
//       }
//     }

//     const total = contacts.length;

//     // Update campaign status to running
//     await Campaign.update(id, {
//       status: "running",
//       total_contacts: total,
//     });

//     // Create logs for all contacts
//     await CampaignLog.bulkCreate(
//       id,
//       contacts.map((c) => c.id),
//     );

//     // Start sending messages asynchronously
//     sendCampaignMessages(
//       id,
//       contacts,
//       template,
//       campaign.template_variables,
//       campaign.media_url,
//       campaign.carousel_media,
//     );

//     const updated = await Campaign.findById(id);
//     res.json({ success: true, campaign: updated });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// };

// // Get campaign logs
// exports.getCampaignLogs = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const logs = await CampaignLog.findByCampaignId(id);
//     res.json(logs);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// // Helper: Get contacts by filters
// async function getContactsByFilters(filters) {
//   let contacts = await Contact.findAll();

//   if (filters.stage && filters.stage.length) {
//     contacts = contacts.filter((c) => filters.stage.includes(c.stage));
//   }
//   if (filters.location) {
//     contacts = contacts.filter((c) =>
//       c.preferred_location
//         ?.toLowerCase()
//         .includes(filters.location.toLowerCase()),
//     );
//   }
//   if (filters.property_type) {
//     contacts = contacts.filter(
//       (c) => c.property_type === filters.property_type,
//     );
//   }
//   if (filters.budget_min) {
//     contacts = contacts.filter(
//       (c) => (c.budget_max || 0) >= filters.budget_min,
//     );
//   }
//   if (filters.budget_max) {
//     contacts = contacts.filter(
//       (c) => (c.budget_min || 0) <= filters.budget_max,
//     );
//   }
//   if (filters.source) {
//     contacts = contacts.filter((c) => c.source === filters.source);
//   }
//   if (filters.date_from) {
//     contacts = contacts.filter((c) => c.created_at >= filters.date_from);
//   }
//   if (filters.date_to) {
//     contacts = contacts.filter((c) => c.created_at <= filters.date_to);
//   }
//   if (filters.tagIds && filters.tagIds.length) {
//     contacts = contacts.filter((c) =>
//       filters.tagIds.every((tagId) => c.tags?.some((t) => t.id === tagId)),
//     );
//   }

//   return contacts;
// }

// // Helper: Get contacts by IDs
// async function getContactsByIds(ids) {
//   let contacts = await Contact.findAll();
//   return contacts.filter((c) => ids.includes(c.id));
// }

// // Helper: Send campaign messages
// async function sendCampaignMessages(
//   campaignId,
//   contacts,
//   template,
//   templateVars,
//   mediaUrl,
//   carouselMedia,
// ) {
//   let sent = 0,
//     delivered = 0,
//     read = 0,
//     failed = 0;

//   for (const contact of contacts) {
//     try {
//       // Prepare variables
//       const variables = [];
//       if (templateVars && templateVars.length) {
//         for (let i = 0; i < templateVars.length; i++) {
//           let val = templateVars[i];
//           // Replace {{contact.field}} with actual contact data
//           if (val && val.includes("{{contact.")) {
//             const field = val.match(/{{contact\.(\w+)}}/)?.[1];
//             if (field) {
//               val = contact[field] || "";
//             }
//           }
//           variables.push(val);
//         }
//       }

//       // Send template message
//       const messageId = await sendTemplateMessage(
//         contact.phone,
//         template.name,
//         template.language || "en",
//         [],
//       );

//       sent++;
//       await Campaign.updateStats(campaignId, 1, 0, 0, 0);

//       // Update log status
//       // In real scenario, webhook would update delivered/read
//       setTimeout(async () => {
//         delivered++;
//         await Campaign.updateStats(campaignId, 0, 1, 0, 0);
//       }, 2000);

//       setTimeout(async () => {
//         read++;
//         await Campaign.updateStats(campaignId, 0, 0, 1, 0);
//       }, 5000);
//     } catch (err) {
//       failed++;
//       await Campaign.updateStats(campaignId, 0, 0, 0, 1);
//       console.error(`Failed to send to ${contact.phone}:`, err.message);
//     }
//   }

//   // Update campaign status to completed
//   await Campaign.update(campaignId, { status: "completed" });
// }

const Campaign = require("../models/campaign.Model");
const CampaignLog = require("../models/campaignLog.Model");
const Contact = require("../models/contact.Model");
const Template = require("../models/template.Model");
const { sendTemplateMessage } = require("../integrations/whatsapp");

// Get all campaigns
exports.getAllCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.findAll();
    res.json(campaigns);
  } catch (err) {
    console.error("Error in getAllCampaigns:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get campaign by ID
exports.getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    res.json(campaign);
  } catch (err) {
    console.error("Error in getCampaignById:", err);
    res.status(500).json({ error: err.message });
  }
};

// Create campaign
exports.createCampaign = async (req, res) => {
  try {
    const campaignData = req.body;

    // Validate template exists and is approved
    if (campaignData.template_id) {
      const template = await Template.findById(campaignData.template_id);
      if (!template) {
        return res.status(400).json({ error: "Template not found" });
      }
      if (template.status !== "APPROVED") {
        return res
          .status(400)
          .json({ error: "Template must be approved to create campaign" });
      }
    }

    const id = await Campaign.create(campaignData);
    const newCampaign = await Campaign.findById(id);
    res.status(201).json(newCampaign);
  } catch (err) {
    console.error("Error in createCampaign:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update campaign
exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Campaign.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const updated = await Campaign.update(id, req.body);
    res.json(updated);
  } catch (err) {
    console.error("Error in updateCampaign:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete campaign
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Campaign.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    await Campaign.delete(id);
    res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error("Error in deleteCampaign:", err);
    res.status(500).json({ error: err.message });
  }
};

// Launch campaign
exports.launchCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== "draft" && campaign.status !== "paused") {
      return res.status(400).json({ error: "Campaign cannot be launched" });
    }

    // Get template
    const template = await Template.findById(campaign.template_id);
    if (!template || template.status !== "APPROVED") {
      return res.status(400).json({ error: "Template not approved" });
    }

    // Get contacts based on audience mode
    let contacts = [];

    if (campaign.audience_mode === "segment") {
      // Apply filters to get contacts
      const filters = campaign.audience_filters || campaign.filters;
      contacts = await getContactsByFilters(filters);
    } else if (campaign.audience_mode === "upload") {
      // Use uploaded contacts
      const uploaded = campaign.uploaded_contacts || [];
      contacts = uploaded.map((c, index) => ({
        id: index + 1,
        name: c.name,
        phone: c.phone,
      }));
    } else if (campaign.audience_mode === "manual") {
      // Use manually selected contact IDs
      const selectedIds = campaign.selected_contact_ids || [];
      if (selectedIds.length) {
        contacts = await getContactsByIds(selectedIds);
      }
    }

    const total = contacts.length;

    if (total === 0) {
      return res
        .status(400)
        .json({ error: "No contacts found for this campaign" });
    }

    // Update campaign status to running
    await Campaign.update(id, {
      status: "running",
      total_contacts: total,
    });

    // Create logs for all contacts
    const contactIds = contacts.map((c) => c.id).filter((id) => id);
    if (contactIds.length > 0) {
      await CampaignLog.bulkCreate(id, contactIds);
    }

    // Start sending messages asynchronously
    sendCampaignMessages(
      id,
      contacts,
      template,
      campaign.template_variables,
      campaign.media_url,
      campaign.carousel_media,
    );

    const updated = await Campaign.findById(id);
    res.json({ success: true, campaign: updated });
  } catch (err) {
    console.error("Error in launchCampaign:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get campaign logs
exports.getCampaignLogs = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Fetching logs for campaign ID: ${id}`);

    // Check if campaign exists
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const logs = await CampaignLog.findByCampaignId(id);
    console.log(`Found ${logs.length} logs for campaign ${id}`);

    res.json(logs);
  } catch (err) {
    console.error("Error in getCampaignLogs:", err);
    res.status(500).json({ error: err.message });
  }
};

// Resend a specific failed message
exports.resendMessage = async (req, res) => {
  try {
    const { id, logId } = req.params;

    console.log(`Resending message - Campaign: ${id}, Log: ${logId}`);

    // Check if campaign exists
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Get template
    const template = await Template.findById(campaign.template_id);
    if (!template || template.status !== "APPROVED") {
      return res.status(400).json({ error: "Template not approved" });
    }

    // Reset the log status
    const log = await CampaignLog.resendMessage(logId, id);
    if (!log) {
      return res.status(404).json({ error: "Log entry not found" });
    }

    // Get contact details
    let contact = null;
    if (log.contact_id) {
      contact = await Contact.findById(log.contact_id);
    }

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Prepare variables
    const variables = campaign.template_variables || [];
    const processedVariables = variables.map((v) => {
      if (v && v.includes("{{contact.")) {
        const field = v.match(/{{contact\.(\w+)}}/)?.[1];
        if (field && contact[field]) {
          return contact[field];
        }
        return "";
      }
      return v;
    });

    // Resend the message
    try {
      const messageId = await sendTemplateMessage(
        contact.phone,
        template.name,
        template.language || "en",
        processedVariables,
      );

      // Update log with new message ID
      await CampaignLog.updateStatus(logId, "sent", {
        whatsapp_msg_id: messageId,
      });

      res.json({ success: true, message: "Message resent successfully" });
    } catch (sendErr) {
      await CampaignLog.updateStatus(logId, "failed", {
        error_message: sendErr.message,
      });
      throw sendErr;
    }
  } catch (err) {
    console.error("Error in resendMessage:", err);
    res.status(500).json({ error: err.message });
  }
};

// Resend all failed messages for a campaign
exports.resendAllFailed = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Resending all failed messages for campaign: ${id}`);

    // Check if campaign exists
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    // Get template
    const template = await Template.findById(campaign.template_id);
    if (!template || template.status !== "APPROVED") {
      return res.status(400).json({ error: "Template not approved" });
    }

    // Reset all failed logs
    const count = await CampaignLog.resendAllFailed(id);

    // Get all failed logs to resend
    const failedLogs = await CampaignLog.findByCampaignId(id);
    const failedMessages = failedLogs.filter((log) => log.status === "pending");

    // Resend each message
    for (const log of failedMessages) {
      try {
        const contact = await Contact.findById(log.contact_id);
        if (contact) {
          const variables = campaign.template_variables || [];
          const processedVariables = variables.map((v) => {
            if (v && v.includes("{{contact.")) {
              const field = v.match(/{{contact\.(\w+)}}/)?.[1];
              if (field && contact[field]) return contact[field];
              return "";
            }
            return v;
          });

          const messageId = await sendTemplateMessage(
            contact.phone,
            template.name,
            template.language || "en",
            processedVariables,
          );

          await CampaignLog.updateStatus(log.id, "sent", {
            whatsapp_msg_id: messageId,
          });
        }
      } catch (sendErr) {
        console.error(`Failed to resend to log ${log.id}:`, sendErr.message);
        await CampaignLog.updateStatus(log.id, "failed", {
          error_message: sendErr.message,
        });
      }
    }

    res.json({ success: true, message: `${count} messages queued for resend` });
  } catch (err) {
    console.error("Error in resendAllFailed:", err);
    res.status(500).json({ error: err.message });
  }
};

// Helper: Get contacts by filters
async function getContactsByFilters(filters) {
  try {
    let contacts = await Contact.findAll();

    if (!contacts || contacts.length === 0) {
      return [];
    }

    if (filters.stage && filters.stage.length) {
      contacts = contacts.filter((c) => filters.stage.includes(c.stage));
    }
    if (filters.location) {
      contacts = contacts.filter((c) =>
        c.preferred_location
          ?.toLowerCase()
          .includes(filters.location.toLowerCase()),
      );
    }
    if (filters.property_type) {
      contacts = contacts.filter(
        (c) => c.property_type === filters.property_type,
      );
    }
    if (filters.budget_min) {
      contacts = contacts.filter(
        (c) => (c.budget_max || 0) >= filters.budget_min,
      );
    }
    if (filters.budget_max) {
      contacts = contacts.filter(
        (c) => (c.budget_min || 0) <= filters.budget_max,
      );
    }
    if (filters.source) {
      contacts = contacts.filter((c) => c.source === filters.source);
    }
    if (filters.date_from) {
      contacts = contacts.filter((c) => c.created_at >= filters.date_from);
    }
    if (filters.date_to) {
      contacts = contacts.filter((c) => c.created_at <= filters.date_to);
    }
    if (filters.tagIds && filters.tagIds.length) {
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

// Helper: Send campaign messages
async function sendCampaignMessages(
  campaignId,
  contacts,
  template,
  templateVars,
  mediaUrl,
  carouselMedia,
) {
  let sent = 0;
  let failed = 0;

  console.log(
    `Starting to send ${contacts.length} messages for campaign ${campaignId}`,
  );

  for (const contact of contacts) {
    try {
      // Prepare variables
      const variables = [];
      if (templateVars && templateVars.length) {
        for (let i = 0; i < templateVars.length; i++) {
          let val = templateVars[i];
          // Replace {{contact.field}} with actual contact data
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
      }

      // Send template message
      const messageId = await sendTemplateMessage(
        contact.phone,
        template.name,
        template.language || "en",
        variables,
      );

      sent++;

      // Update log status to sent
      const log = await CampaignLog.findByContactAndCampaign(
        campaignId,
        contact.id,
      );
      if (log) {
        await CampaignLog.updateStatus(log.id, "sent", {
          whatsapp_msg_id: messageId,
        });
      }

      await Campaign.updateStats(campaignId, 1, 0, 0, 0);

      console.log(
        `Message sent to ${contact.phone} (${sent}/${contacts.length})`,
      );
    } catch (err) {
      failed++;
      await Campaign.updateStats(campaignId, 0, 0, 0, 1);
      console.error(`Failed to send to ${contact.phone}:`, err.message);

      // Update log status to failed
      const log = await CampaignLog.findByContactAndCampaign(
        campaignId,
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
  await Campaign.update(campaignId, { status: "completed" });
  console.log(
    `Campaign ${campaignId} completed. Sent: ${sent}, Failed: ${failed}`,
  );
}