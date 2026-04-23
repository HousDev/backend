const router = require("express").Router();
const campaignController = require("../controllers/campaign.Controller");

// Get all campaigns
router.get("/", campaignController.getAllCampaigns);

// Get campaign by ID
router.get("/:id", campaignController.getCampaignById);

// Create campaign
router.post("/", campaignController.createCampaign);

// Update campaign
router.put("/:id", campaignController.updateCampaign);

// Delete campaign
router.delete("/:id", campaignController.deleteCampaign);

// Launch campaign
router.post("/:id/launch", campaignController.launchCampaign);

// Get campaign logs
router.get("/:id/logs", campaignController.getCampaignLogs);

module.exports = router;
