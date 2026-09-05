// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const rateLimit = require("express-rate-limit");
// const path = require("path");   //for local

const fs = require("fs");
//---SERVER CONFIG---
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || "/var/www/uploads";
const UPLOAD_PUBLIC_BASE = process.env.UPLOAD_PUBLIC_BASE || "/uploads";

//USE FOR LOCAL DEV (overrides .env for easier testing)
// const UPLOAD_ROOT = process.env.UPLOAD_ROOT 
//   ? require('path').resolve(process.env.UPLOAD_ROOT)
//   : require('path').join(__dirname, 'uploads');
// const UPLOAD_PUBLIC_BASE = process.env.UPLOAD_PUBLIC_BASE || "/uploads";


// Routes
const masterRoutes = require("./routes/masterRoutes");
const leadRoutes = require("./routes/lead.routes");
const remarkRoutes = require("./routes/connectedRemarkRoutes");
const propertyRoutes = require("./routes/property.routes");
const rentalPropertyRoutes = require("./routes/rentalProperty.routes");
const propertyStatusRoutes = require("./routes/propertyStatus.routes");
const aiRoutes = require("./routes/description.routes");
const bulkOperationsRoutes = require("./routes/bulkOperations.routes");
const clientLeadNotificationRoutes = require("./routes/clientLeadNotificationRoutes");
const systemSettingsRoutes = require("./routes/systemSettings.routes");
const templateRoutes = require("./routes/templateRoutes");
const templateContentRoutes = require("./routes/template.routes");
const viewsRoutes = require("./routes/views.routes");
const blogRoutes = require("./routes/blog.routes");
const contactRoutes = require("./routes/contactRoutes");
const variableRoutes = require("./routes/variableRoutes");
const buyerFollowupRoutes = require("./routes/buyerFollowupRoutes");
const documentsTemplateRoutes = require("./routes/documentsTemplateRoutes");
const documentsGeneratedRoutes = require("./routes/documentsGeneratedRoutes");
const receiptRoutes = require("./routes/propertyPaymentReceipt.routes");
const rssRoutes = require("./routes/rssRoutes");
const documentStatusRoutes = require("./routes/documentStatus.routes");
const eSignRoutes = require("./routes/eSign.routes");

const aiBlogRoutes = require("./routes/aiBlogs.routes");
const homeHeroRoutes = require("./routes/homeHero.routes");
const backupRoutes = require("./routes/backup.routes");

const visitRoutes = require("./routes/propertyVisits");
const smsRoutes = require("./routes/smsRoutes");
const buyerSavedPropsRoutes = require("./routes/buyerSavedPropertiesRoutes");
const blogCommentsRoutes = require("./routes/blogCommentsRoutes");

const rbacRoutes = require("./routes/rbacRoutes");
const integrationRoutes = require("./routes/integration.routes");

const http = require("http");
// const { initSocket } = require("./utils/socket");
const templateSync = require("./corn/templateSync");
// Add this line with other requires
require("./corn/chatbotCleanup");
const { startCampaignScheduler } = require("./corn/campaignScheduler");
const societyRoutes = require("./routes/SocietyRoutes");

const googleSheetsRoutes = require("./routes/googleSheets.routes");
const app = express();

app.set("trust proxy", 1);

// Body parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// CORS
const allowedOrigins = [
  "https://resaleexpert.in",
  "https://www.resaleexpert.in",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:3000",
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some((o) => origin && origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-access-token",
    "x-guest-uuid",
    "x-client-id",
    "ngrok-skip-browser-warning",
  ],
  exposedHeaders: ["Content-Disposition"],
};
app.use(cors(corsOptions));

// Rate limiting — relaxed in dev & ignore OPTIONS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.method === "OPTIONS" || process.env.NODE_ENV !== "production",
  message: { success: false, message: "Too many requests. Please try later." },
});
app.use("/api/", limiter);

// Compression + Logging
app.use(compression());
app.use(
  process.env.NODE_ENV !== "production" ? morgan("dev") : morgan("combined"),
);

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

// Health
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "AI CRM Backend API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  });
});
// app.set("trust proxy", true);
// API routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/leads", leadRoutes);
app.use("/api/activities", require("./routes/activity.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/masters", masterRoutes);
app.use("/api/automation", require("./routes/automationMaster.routes"));
app.use("/api/connected-remarks", remarkRoutes);
app.use("/api/followups", require("./routes/followupRoutes"));
app.use("/api/properties", propertyRoutes);
app.use("/api/rental-properties", rentalPropertyRoutes);
app.use("/buy/projects", propertyRoutes);
app.use("/api/buyers", require("./routes/buyerRoutes"));
app.use("/api/doc-status", documentStatusRoutes);
app.use("/api/esign", eSignRoutes);
app.use("/api/digio", require("./routes/digio"));
app.use("/api", smsRoutes);
app.use("/api/buyer-saved-properties", buyerSavedPropsRoutes);
app.use("/api", blogCommentsRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/templates", templateRoutes);

app.use("/api/contacts", require("./routes/contacts.routes"));
app.use("/api/messages", require("./routes/messages.routes"));
app.use("/api/chat", require("./routes/chat.routes"));
app.use("/api/rex", require("./routes/rex.routes"));
app.use("/api/templates", require("./routes/templates.routes"));

app.use("/api/campaigns", require("./routes/campaigns"));
app.use("/api/chatbot", require("./routes/chatbot.routes"));

app.use("/api/webhook", require("./routes/webhook"));

app.use("/api/societies", societyRoutes);
app.use("/api/location", require("./routes/locationRoutes"));

app.use("/api/broadcasts", require("./routes/broadcasts.routes"));
app.use("/api/rules", require("./routes/rules.routes"));
app.use("/api/analytics", require("./routes/analytics.routes"));

// Add this with other routes


app.use("/api/rbac", rbacRoutes);
app.use("/api/backup", backupRoutes);

app.use("/api/google-sheets", googleSheetsRoutes);
// for use for loacal
// app.use(
//   '/uploads',
//   helmet.crossOriginResourcePolicy({ policy: 'cross-origin' })
// );

// app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https://resaleexpert.in",
          "https://resaleexpert.in",
          "http://localhost:3000",
          "http://localhost:5173/",
        ],
        "style-src": ["'self'", "https:", "'unsafe-inline'"],
        "font-src": ["'self'", "https:", "data:"],
        "frame-ancestors": ["'self'"],
      },
    },
  }),
);


// const { emitToUser } = require("./utils/socket");

app.get("/test-socket", (req, res) => {
  const userId = "1";
  if (global.io) {
    global.io.to(`user:${userId}`).emit("chat_update", {
      contact_id: 999,
      text: "Hello from app.get 🚀",
    });
  }
  res.json({ success: true, message: "Socket test triggered" });
});

app.use(
  UPLOAD_PUBLIC_BASE,
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
);

app.use(
  UPLOAD_PUBLIC_BASE,
  express.static(UPLOAD_ROOT, {
    fallthrough: true,
    etag: true,
    maxAge: "1y",
    immutable: true,
    setHeaders: (res) => {
      // mirror your Nginx Cache-Control
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);

// Static files (IMPORTANT)
app.use("/api", require("./routes/buyerTransferRoute"));
app.use("/api", require("./routes/sellerTransferRoute"));
app.use("/api/sellers", require("./routes/sellerRoutes"));
app.use("/api/owners", require("./routes/ownerRoutes"));
app.use("/api/tenants", require("./routes/tenant.routes"));
app.use("/api/tenant-followups", require("./routes/tenantFollowupRoutes"));
app.use("/api/tenant-visits", require("./routes/tenantVisitRoutes"));
app.use("/api/tenant-activities", require("./routes/tenantActivityRoutes"));
app.use("/api/ownerfollowups", require("./routes/ownerFollowupRoutes"));
app.use("/api/selleractivities", require("./routes/sellerActivities"));
app.use("/api/sellerfollowups", require("./routes/sellerFollowupRoutes"));

app.use("/api/sellerdocuments", require("./routes/sellerDocuments"));
app.use("/api/ai", aiRoutes); // <-- new line
app.use("/api/status-update", propertyStatusRoutes);
app.use("/api/bulk-operations", bulkOperationsRoutes);
app.use("/api/client-lead-notifications", clientLeadNotificationRoutes);

app.use(
  "/api/public/system-settings",
  require("./routes/publicSystemSettings.routes"),
);

app.use("/api/system-settings", systemSettingsRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/ai", templateContentRoutes);
app.use("/api/views", viewsRoutes);
app.use("/api/blog-posts", blogRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/buyer-followups", buyerFollowupRoutes);
app.use("/api/variables", variableRoutes);
app.use("/api/doctemplates/", documentsTemplateRoutes);
app.use("/api/documents-generated", documentsGeneratedRoutes);
app.use("/api/rss-sources", rssRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/ai-blogs", aiBlogRoutes);
app.use("/api/home-hero", homeHeroRoutes);
app.use("/api/property-tags", require("./routes/propertyTagsJson.routes"));
app.use("/api/visits", visitRoutes);
app.use("/api/reports", require("./routes/report.routes"));

// Root
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to AI CRM Backend API",
    version: "1.0.0",
    documentation: "/api/health for health check",
  });
});
const slugRedirect = require("./middleware/slugRedirect");

const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
  path: "/socket.io",
});

global.io = io;

const jwt = require('jsonwebtoken');
const authConfig = require('./config/auth.config');

function getSocketAuthenticatedUser(socket, data) {
  let token =
    socket.handshake?.auth?.token ||
    socket.handshake?.headers?.authorization ||
    socket.handshake?.query?.token ||
    data?.token;

  if (token && typeof token === 'string' && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, authConfig.secret);
      if (decoded && decoded.id) {
        return { userId: Number(decoded.id), role: decoded.role || 'user', isJwt: true };
      }
    } catch (e) {
      // Invalid JWT token
    }
  }

  // Fallback for existing socket connections
  const queryUserId = socket.handshake?.query?.userId;
  if (queryUserId) {
    return { userId: Number(queryUserId), role: 'user', isJwt: false };
  }

  return null;
}

// In-Memory Presence Tracking (No DB persistence)
const onlineUsers = new Map(); // userId (number) -> Set<socketId>
const lastSeenUsers = new Map(); // userId (number) -> ISO string

io.on('connection', (socket) => {
  const authUser = getSocketAuthenticatedUser(socket, null);
  const rawUserId = authUser?.userId || socket.handshake.query?.userId;
  const socketUserId = rawUserId ? Number(rawUserId) : null;

  if (socketUserId) {
    socket.join(`user:${socketUserId}`);

    // Track in onlineUsers map
    if (!onlineUsers.has(socketUserId)) {
      onlineUsers.set(socketUserId, new Set());
    }
    onlineUsers.get(socketUserId).add(socket.id);

    // Broadcast online status
    io.emit('user:presence', {
      userId: socketUserId,
      status: 'online',
    });
  }

  socket.on('disconnect', () => {
    if (socketUserId && onlineUsers.has(socketUserId)) {
      const userSockets = onlineUsers.get(socketUserId);
      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(socketUserId);
        const lastSeen = new Date().toISOString();
        lastSeenUsers.set(socketUserId, lastSeen);

        io.emit('user:presence', {
          userId: socketUserId,
          status: 'offline',
          lastSeen,
        });
      }
    }
  });

  socket.on('user:get_presence', (data, callback) => {
    try {
      const targetUserIds = Array.isArray(data?.userIds) ? data.userIds.map(Number) : [];
      const result = {};

      for (const uid of targetUserIds) {
        if (!uid) continue;
        const isOnline = onlineUsers.has(uid) && onlineUsers.get(uid).size > 0;
        result[uid] = {
          userId: uid,
          status: isOnline ? 'online' : 'offline',
          lastSeen: isOnline ? null : lastSeenUsers.get(uid) || null,
        };
      }

      if (typeof callback === 'function') {
        callback(result);
      } else {
        socket.emit('user:presence_batch', result);
      }
    } catch (err) {
      console.error('Socket user:get_presence error:', err);
    }
  });

  socket.on('join_contact_room', (contactId) => {
    socket.join(`contact:${contactId}`);
  });

  socket.on('leave_contact_room', (contactId) => {
    socket.leave(`contact:${contactId}`);
  });

  // ---- Chat System Real-Time Handlers ----
  socket.on('chat:join_room', async (data) => {
    try {
      const conversationId = typeof data === 'object' ? data.conversationId : data;
      const user = getSocketAuthenticatedUser(socket, typeof data === 'object' ? data : null);
      if (!user || !conversationId) {
        socket.emit('chat:error', { message: 'Authentication required for chat' });
        return;
      }

      const ChatModel = require('./models/chat.model');
      const conv = await ChatModel.findById(conversationId);
      if (!conv) {
        socket.emit('chat:error', { message: 'Conversation not found' });
        return;
      }

      const isOwner = Number(conv.user_id) === Number(user.userId);
      const isExec = Number(conv.executive_id) === Number(user.userId);
      const isAdmin = ['admin', 'super_admin'].includes(String(user.role || '').toLowerCase());

      if (isOwner || isExec || isAdmin) {
        socket.join(`conversation:${conv.id}`);
        socket.emit('chat:room_joined', { conversationId: conv.id });

        // Send presence of opposite party
        const otherUserId = isOwner ? Number(conv.executive_id) : Number(conv.user_id);
        if (otherUserId) {
          const isOnline = onlineUsers.has(otherUserId) && onlineUsers.get(otherUserId).size > 0;
          socket.emit('user:presence', {
            userId: otherUserId,
            status: isOnline ? 'online' : 'offline',
            lastSeen: isOnline ? null : lastSeenUsers.get(otherUserId) || null,
          });
        }
      } else {
        socket.emit('chat:error', { message: 'Unauthorized to join this conversation' });
      }
    } catch (err) {
      console.error('Socket chat:join_room error:', err);
    }
  });

  socket.on('chat:leave_room', (data) => {
    const conversationId = typeof data === 'object' ? data.conversationId : data;
    if (conversationId) {
      socket.leave(`conversation:${conversationId}`);
      socket.emit('chat:room_left', { conversationId });
    }
  });

  // Typing Start / Stop (Ephemeral in-memory broadcast)
  socket.on('chat:typing_start', async (data) => {
    try {
      const { conversationId } = data || {};
      const user = getSocketAuthenticatedUser(socket, data);
      if (!user || !conversationId) return;

      const ChatModel = require('./models/chat.model');
      const conv = await ChatModel.findById(conversationId);
      if (!conv) return;

      const isOwner = Number(conv.user_id) === Number(user.userId);
      const isExec = Number(conv.executive_id) === Number(user.userId);
      const isAdmin = ['admin', 'super_admin'].includes(String(user.role || '').toLowerCase());

      if (!isOwner && !isExec && !isAdmin) return;

      // Broadcast typing to conversation room (excluding sender)
      socket.to(`conversation:${conv.id}`).emit('chat:typing', {
        conversationId: conv.id,
        senderId: Number(user.userId),
        senderRole: user.role || 'user',
        typing: true,
      });
    } catch (err) {
      console.error('Socket chat:typing_start error:', err);
    }
  });

  socket.on('chat:typing_stop', async (data) => {
    try {
      const { conversationId } = data || {};
      const user = getSocketAuthenticatedUser(socket, data);
      if (!user || !conversationId) return;

      const ChatModel = require('./models/chat.model');
      const conv = await ChatModel.findById(conversationId);
      if (!conv) return;

      const isOwner = Number(conv.user_id) === Number(user.userId);
      const isExec = Number(conv.executive_id) === Number(user.userId);
      const isAdmin = ['admin', 'super_admin'].includes(String(user.role || '').toLowerCase());

      if (!isOwner && !isExec && !isAdmin) return;

      // Broadcast stop typing to conversation room (excluding sender)
      socket.to(`conversation:${conv.id}`).emit('chat:typing', {
        conversationId: conv.id,
        senderId: Number(user.userId),
        senderRole: user.role || 'user',
        typing: false,
      });
    } catch (err) {
      console.error('Socket chat:typing_stop error:', err);
    }
  });

  // Message Delivered Acknowledgement
  socket.on('chat:message_delivered', async (data) => {
    try {
      const { conversationId, messageId, messageUuid } = data || {};
      const user = getSocketAuthenticatedUser(socket, data);
      if (!user || !conversationId) return;

      const ChatModel = require('./models/chat.model');
      const conv = await ChatModel.findById(conversationId);
      if (!conv) return;

      const isOwner = Number(conv.user_id) === Number(user.userId);
      const isExec = Number(conv.executive_id) === Number(user.userId);
      const isAdmin = ['admin', 'super_admin'].includes(String(user.role || '').toLowerCase());

      if (!isOwner && !isExec && !isAdmin) return;

      const db = require('./config/database');
      if (messageId) {
        await db.execute(
          `UPDATE property_chat_messages
           SET is_delivered = 1
           WHERE id = ? AND conversation_id = ? AND sender_id != ? AND is_delivered = 0`,
          [messageId, conv.id, user.userId]
        ).catch(() => {});
      } else if (messageUuid) {
        await db.execute(
          `UPDATE property_chat_messages
           SET is_delivered = 1
           WHERE message_uuid = ? AND conversation_id = ? AND sender_id != ? AND is_delivered = 0`,
          [messageUuid, conv.id, user.userId]
        ).catch(() => {});
      }

      io.to(`conversation:${conv.id}`).emit('chat:message_delivered', {
        conversationId: conv.id,
        messageId: messageId || null,
        messageUuid: messageUuid || null,
        deliveredAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Socket chat:message_delivered error:', err);
    }
  });

  socket.on('chat:send_message', async (data) => {
    try {
      const { conversationId, messageText, messageType, messageUuid } = data || {};
      const authUser = getSocketAuthenticatedUser(socket, data);
      if (!authUser || !conversationId || !messageText || !messageText.trim()) {
        socket.emit('chat:error', { message: 'Authentication and valid message text required' });
        return;
      }

      const ChatModel = require('./models/chat.model');
      const conv = await ChatModel.findById(conversationId);
      if (!conv) {
        socket.emit('chat:error', { message: 'Conversation not found' });
        return;
      }

      const isOwner = Number(conv.user_id) === Number(authUser.userId);
      const isExec = Number(conv.executive_id) === Number(authUser.userId);
      const isAdmin = ['admin', 'super_admin'].includes(String(authUser.role || '').toLowerCase());

      if (!isOwner && !isExec && !isAdmin) {
        socket.emit('chat:error', { message: 'Unauthorized to send message in this conversation' });
        return;
      }

      let senderType = 'user';
      if (isAdmin) senderType = 'admin';
      else if (isExec) senderType = 'executive';

      const { message, isDuplicate } = await ChatModel.createMessage({
        conversationId: conv.id,
        senderId: Number(authUser.userId),
        senderType,
        messageType: messageType || 'text',
        messageText: messageText.trim(),
        messageUuid: messageUuid || null,
      });

      if (!isDuplicate) {
        io.to(`conversation:${conv.id}`).emit('chat:new_message', message);
        if (conv.executive_id) {
          io.to(`user:${conv.executive_id}`).emit('chat:new_message', message);
        }
        if (conv.user_id) {
          io.to(`user:${conv.user_id}`).emit('chat:new_message', message);
        }

        if (senderType === 'user') {
          io.to(`user:${conv.executive_id}`).emit('chat:unread_count_update', {
            conversationId: conv.id,
            unreadCount: (conv.unread_executive_count || 0) + 1,
          });
        } else {
          io.to(`user:${conv.user_id}`).emit('chat:unread_count_update', {
            conversationId: conv.id,
            unreadCount: (conv.unread_user_count || 0) + 1,
          });
        }
      }
    } catch (err) {
      console.error('Socket chat:send_message error:', err);
    }
  });

  socket.on('chat:read_receipt', async (data) => {
    try {
      const { conversationId } = data || {};
      const authUser = getSocketAuthenticatedUser(socket, data);
      if (!authUser || !conversationId) return;

      const ChatModel = require('./models/chat.model');
      const conv = await ChatModel.findById(conversationId);
      if (!conv) return;

      const isOwner = Number(conv.user_id) === Number(authUser.userId);
      const isExec = Number(conv.executive_id) === Number(authUser.userId);
      const isAdmin = ['admin', 'super_admin'].includes(String(authUser.role || '').toLowerCase());

      if (!isOwner && !isExec && !isAdmin) return;

      const role = isExec || isAdmin ? 'executive' : 'user';
      await ChatModel.markMessagesAsRead(conv.id, Number(authUser.userId), role);

      io.to(`conversation:${conv.id}`).emit('chat:messages_read', {
        conversationId: conv.id,
        readBy: Number(authUser.userId),
        readAt: new Date().toISOString(),
      });
      io.to(`user:${authUser.userId}`).emit('chat:unread_count_update', {
        conversationId: conv.id,
        unreadCount: 0,
      });
    } catch (err) {
      console.error('Socket chat:read_receipt error:', err);
    }
  });
});


// initSocket(server);

app.use(slugRedirect);

// 404
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    path: req.originalUrl,
  });
});

// Global error
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});


// Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
});

// ✅ Start schedulers AFTER server is ready
startCampaignScheduler();
const { startAutomationMasterCron } = require("./corn/automationMasterCron");
startAutomationMasterCron();

module.exports = app;
