// backend/routes/chat.routes.js
const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chat.controller");
const { verifyToken } = require("../middleware/authJwt");
const {
  uploadMedia,
  handleUploadErrors,
  attachPublicUrls,
} = require("../middleware/upload");

// All chat routes require valid JWT authentication
router.use(verifyToken);

// Conversation endpoints
router.post("/conversations", chatController.createOrGetConversation);
router.get("/conversations", chatController.getConversations);
router.get("/conversations/:conversationId", chatController.getConversationById);

// Message endpoints
router.get("/conversations/:conversationId/messages", chatController.getMessages);
router.post("/conversations/:conversationId/messages", chatController.sendMessage);
router.post(
  "/conversations/:conversationId/media",
  uploadMedia.single("file"),
  handleUploadErrors,
  attachPublicUrls,
  chatController.sendMedia
);

// Read receipts and management
router.get("/executives", chatController.getAvailableExecutives);
router.post("/conversations/:conversationId/read", chatController.markAsRead);
router.post("/conversations/:conversationId/reassign", chatController.reassignExecutive);
router.post("/conversations/:conversationId/smart-replies", chatController.getSmartReplies);

module.exports = router;
