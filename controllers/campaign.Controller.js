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
    console.error(err);
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
    console.error(err);
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

    // Get matched contacts based on filters
    const filters = campaign.filters;
    let contacts = await Contact.findAll();

    // Apply filters
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
    if (filters.tags && filters.tags.length) {
      // Filter by tags logic here
    }

    // Update campaign status to running
    await Campaign.update(id, {
      status: "running",
      total_contacts: contacts.length,
    });

    // Create logs for all contacts
    await CampaignLog.bulkCreate(
      id,
      contacts.map((c) => c.id),
    );

    // Start sending messages asynchronously
    sendCampaignMessages(id, contacts, template);

    const updated = await Campaign.findById(id);
    res.json({ success: true, campaign: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get campaign logs
exports.getCampaignLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await CampaignLog.findByCampaignId(id);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper function to send campaign messages (async)
async function sendCampaignMessages(campaignId, contacts, template) {
  let sent = 0,
    delivered = 0,
    read = 0,
    failed = 0;

  for (const contact of contacts) {
    try {
      // Send template message
      const messageId = await sendTemplateMessage(
        contact.phone,
        template.name,
        template.language || "en",
        [],
      );

      // Update log status to sent
      sent++;
      await Campaign.updateStats(campaignId, 1, 0, 0, 0);

      // Simulate delivery and read (in real scenario, webhook would update)
      setTimeout(async () => {
        delivered++;
        await Campaign.updateStats(campaignId, 0, 1, 0, 0);
      }, 2000);

      setTimeout(async () => {
        read++;
        await Campaign.updateStats(campaignId, 0, 0, 1, 0);
      }, 5000);
    } catch (err) {
      failed++;
      await Campaign.updateStats(campaignId, 0, 0, 0, 1);
      console.error(`Failed to send to ${contact.phone}:`, err.message);
    }
  }

  // Update campaign status to completed
  await Campaign.update(campaignId, { status: "completed" });
}
