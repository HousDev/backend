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

const fs = require("fs"); //for server

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || "/var/www/uploads";
const UPLOAD_PUBLIC_BASE = process.env.UPLOAD_PUBLIC_BASE || "/uploads"; // URL base

// Routes
const masterRoutes = require("./routes/masterRoutes");
const leadRoutes = require("./routes/lead.routes");
const remarkRoutes = require("./routes/connectedRemarkRoutes");
const propertyRoutes = require("./routes/property.routes");
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
const receiptRoutes = require('./routes/propertyPaymentReceipt.routes');
const rssRoutes = require("./routes/rssRoutes");
const documentStatusRoutes = require("./routes/documentStatus.routes");
const eSignRoutes = require("./routes/eSign.routes");

const aiBlogRoutes = require("./routes/aiBlogs.routes") 
const homeHeroRoutes = require("./routes/homeHero.routes");

const webhookRouter = require("./routes/digioWebhook");


const smsRoutes = require("./routes/smsRoutes");
const buyerSavedPropsRoutes = require("./routes/buyerSavedPropertiesRoutes");



const app = express();

app.set("trust proxy", 1);
// Security
app.use(helmet());

// Body parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// CORS
const corsOptions = {
  // origin: process.env.CORS_ORIGIN || "http://localhost:5173",  // for local use 
  origin: process.env.CORS_ORIGIN || "http://investordeal.in",
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
   exposedHeaders: ["Content-Disposition"],
};
app.use(cors(corsOptions));

// Rate limiting — relaxed in dev & ignore OPTIONS
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
  process.env.NODE_ENV !== "production" ? morgan("dev") : morgan("combined")
);

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
app.set("trust proxy", true);
// API routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/leads", leadRoutes);
app.use("/api/activities", require("./routes/activity.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/masters", masterRoutes);
app.use("/api/connected-remarks", remarkRoutes);
app.use("/api/followups", require("./routes/followupRoutes"));
app.use("/api/properties", propertyRoutes);
app.use("/buy/projects", propertyRoutes);
app.use("/api/buyers", require("./routes/buyerRoutes"));
app.use("/api/doc-status", documentStatusRoutes);

app.use("/api/esign", eSignRoutes);

app.use("/api", smsRoutes);
app.use("/api/buyer-saved-properties", buyerSavedPropsRoutes);
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
          "https://investordeal.in",
          "https://resaleexpert.in",
        ],
        "style-src": ["'self'", "https:", "'unsafe-inline'"],
        "font-src": ["'self'", "https:", "data:"],
        "frame-ancestors": ["'self'"],
      },
    },
  })
);

app.use(
  UPLOAD_PUBLIC_BASE,
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" })
);

app.use(
  UPLOAD_PUBLIC_BASE,
  express.static(UPLOAD_ROOT, {
    fallthrough: false,
    etag: true,
    maxAge: "1y",
    immutable: true,
    setHeaders: (res) => {
      // mirror your Nginx Cache-Control
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

// Static files (IMPORTANT)
app.use("/api", require("./routes/buyerTransferRoute"));
app.use("/api", require("./routes/sellerTransferRoute"));
app.use("/api/sellers", require("./routes/sellerRoutes"));
app.use("/api/selleractivities", require("./routes/sellerActivities"));
app.use("/api/sellerfollowups", require("./routes/sellerFollowupRoutes"));
app.use("/api/sellerdocuments", require("./routes/sellerDocuments"));
app.use("/api/razorpay-integration", require("./routes/razorpayRoutes"));
const smsIntegrationRoutes = require("./routes/smsIntegrationRoutes");
app.use("/api/ai", aiRoutes); // <-- new line
app.use("/api/status-update", propertyStatusRoutes);
app.use("/api/bulk-operations", bulkOperationsRoutes);
app.use("/api/client-lead-notifications", clientLeadNotificationRoutes);

app.use(
  "/api/public/system-settings",
  require("./routes/publicSystemSettings.routes")
);

app.use("/api/system-settings", systemSettingsRoutes);
app.use("/api/sms-integration", smsIntegrationRoutes);
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
app.use('/api/receipts', receiptRoutes);
app.use('/api/ai-blogs', aiBlogRoutes)
app.use("/api/home-hero", homeHeroRoutes);
app.use("/api/property-tags", require("./routes/propertyTagsJson.routes"));
app.use("/api/digio/", require("./routes/digioRoutes"));

app.use(
  "/api/digio/webhook",
  express.raw({ type: "application/json" }),
  webhookRouter
);
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

app.use(slugRedirect);

// 404
app.use("*", (req, res) => {
  res
    .status(404)
    .json({
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
app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  // console.log(`📂 Uploads: ${path.join(process.cwd(), "uploads")}\n`);
  console.log(`📂 Uploads disk: ${UPLOAD_ROOT}`);
  +console.log(`🌐 Uploads URL:  ${UPLOAD_PUBLIC_BASE}\n`);
});

module.exports = app;

