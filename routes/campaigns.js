// const router = require("express").Router();
// const campaignController = require("../controllers/campaign.Controller");

// router.get("/", campaignController.getAllCampaigns);
// router.get("/:id", campaignController.getCampaignById);
// router.post("/", campaignController.createCampaign);
// router.put("/:id", campaignController.updateCampaign);
// router.delete("/:id", campaignController.deleteCampaign);
// router.post("/:id/launch", campaignController.launchCampaign);
// router.get("/:id/logs", campaignController.getCampaignLogs);

// module.exports = router;

const router = require("express").Router();
const campaignController = require("../controllers/campaign.Controller");

// Campaign CRUD operations
router.get("/", campaignController.getAllCampaigns);
router.get("/:id", campaignController.getCampaignById);
router.post("/", campaignController.createCampaign);
router.put("/:id", campaignController.updateCampaign);
router.delete("/:id", campaignController.deleteCampaign);

// Campaign actions
router.post("/:id/launch", campaignController.launchCampaign);

// Campaign logs
router.get("/:id/logs", campaignController.getCampaignLogs);

// Resend operations
router.post("/:id/logs/:logId/resend", campaignController.resendMessage);
router.post("/:id/resend-failed", campaignController.resendAllFailed);

module.exports = router;