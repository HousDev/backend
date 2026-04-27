const router = require("express").Router();
const chatbotController = require("../controllers/chatbot.Controller");
// Flow management
router.get("/flows", chatbotController.getAllFlows);
router.get("/flows/:id", chatbotController.getFlowById);
router.post("/flows", chatbotController.createFlow);
router.put("/flows/:id", chatbotController.updateFlow);
router.delete("/flows/:id", chatbotController.deleteFlow);
router.patch("/flows/:id/toggle", chatbotController.toggleFlowStatus);

// Message processing (webhook)
router.post("/process", chatbotController.processMessage);

// Analytics and logs
router.get("/flows/:id/logs", chatbotController.getFlowLogs);
router.get("/conversations/active", chatbotController.getActiveConversations);

module.exports = router;
