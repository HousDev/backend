// server.js — production-ready (corrected & complete)
// Notes:
// - Expects env vars: NODE_ENV, PORT, CORS_ORIGINS (comma-separated), SENTRY_DSN (optional)
// - Add DB connection close logic where indicated
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

/* ---------- Optional integrations (enable if you want) ----------
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
// const Sentry = require("@sentry/node");
// if (process.env.SENTRY_DSN) {
//   Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
//   app.use(Sentry.Handlers.requestHandler());
// }
-----------------------------------------------------------------*/

/* -------------------- Basic security headers ------------------- */
// Helmet with some sensible defaults and CSP example (adjust to your needs)
app.use(
  helmet({
    // keep default protections and add/override others below as needed
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // try to remove 'unsafe-inline' in future
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // set true only if you need COEP
  })
);

// HSTS (only in production)
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet.hsts({
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: true,
    })
  );
}

/* --------------------- Body parsing & cookies ------------------ */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/* -------------------------- CORS ------------------------------- */
// Allowlist from env var CORS_ORIGINS = "https://app.example.com,https://admin.example.com"
const rawOrigins =
  process.env.CORS_ORIGIN ||
  "http://investordeal.in,https://investordeal.in,http://localhost:5173";
const allowedOrigins = rawOrigins.split(",").map((u) => u.trim()).filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // allow server-to-server or tools without origin (like curl/postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("CORS not allowed"));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

/* --------------------- Rate limiting --------------------------- */
// Global rate limiter: smaller limits for auth routes applied separately below
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 1000, // more relaxed locally
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS", // don't count options
  message: { success: false, message: "Too many requests. Please try later." },
});
app.use("/api/", globalLimiter);

// Stricter limiter for auth endpoints (defined later when mounting auth routes)

/* ----------------- Compression + Logging ----------------------- */
app.use(compression());
app.use(process.env.NODE_ENV !== "production" ? morgan("dev") : morgan("combined"));

/* ------------------ Trust proxy (for LB/Ingress) ---------------- */
app.set("trust proxy", true);

/* ------------------ Health / readiness ------------------------ */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "AI CRM Backend API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  });
});

// liveness
app.get("/api/healthz", (req, res) => res.status(200).send("ok"));

// readiness - implement actual checks (DB, queues) in checkReadiness()
async function checkReadiness() {
  // Example: return true only if DB is connected. Replace with real checks.
  // e.g. await mongoose.connection.db.admin().ping()
  return true;
}
app.get("/api/ready", async (req, res) => {
  try {
    const ready = await checkReadiness();
    if (ready) return res.json({ success: true });
    return res.status(503).json({ success: false, message: "Not ready" });
  } catch (err) {
    return res.status(503).json({ success: false, message: "Readiness check failed" });
  }
});

/* ------------------ Static uploads serving --------------------- */
// Use helmet CROSP for uploads and serve with cache-control and no directory index
const uploadsPath = path.join(process.cwd(), "uploads");
app.use(
  "/uploads",
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
  express.static(uploadsPath, {
    index: false, // prevent directory listing
    maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
    immutable: process.env.NODE_ENV === "production",
  })
);

/* --------------------- Import Routes -------------------------- */
// Routes (your existing route files)
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

/* --------------- Mount routes (no duplicate paths) ------------- */
// Auth with stricter limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { success: false, message: "Too many auth attempts. Try later." },
});

app.use("/api/auth", authLimiter, require("./routes/auth.routes"));
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

app.use("/api/sellers", require("./routes/sellerRoutes"));
app.use("/api/selleractivities", require("./routes/sellerActivities"));
app.use("/api/sellerfollowups", require("./routes/sellerFollowups"));
app.use("/api/sellerdocuments", require("./routes/sellerDocuments"));
app.use("/api/razorpay-integration", require("./routes/razorpayRoutes"));

const smsIntegrationRoutes = require("./routes/smsIntegrationRoutes");

// Mount AI routes and template content routes on distinct paths to avoid override
app.use("/api/ai", aiRoutes);
app.use("/api/status-update", propertyStatusRoutes);
app.use("/api/bulk-operations", bulkOperationsRoutes);
app.use("/api/client-lead-notifications", clientLeadNotificationRoutes);
app.use("/api/system-settings", systemSettingsRoutes);
app.use("/api/sms-integration", smsIntegrationRoutes);
app.use("/api/templates", templateRoutes);
// Put template content routes under a more specific path to avoid collision
app.use("/api/templates/content", templateContentRoutes);

app.use("/api/views", viewsRoutes);
app.use("/api/blog-posts", blogRoutes);
app.use("/api/contact", contactRoutes);

/* ----------------------- Root + Slug Redirect ------------------ */
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

/* ------------------------ 404 handler ------------------------- */
app.use("*", (req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found", path: req.originalUrl });
});

/* --------------------- Global error handler ------------------- */
// If Sentry enabled, place its error handler before ours (see commented block at top)
app.use((err, req, res, next) => {
  // log error safely; avoid leaking PII
  console.error("Error:", err?.message || err);
  const status = err?.status || 500;
  const response = {
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err?.message || "Unknown error",
  };
  if (process.env.NODE_ENV !== "production") response.stack = err?.stack;
  res.status(status).json(response);
});

/* -------------------- Start + graceful shutdown ---------------- */
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Server listening: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`📂 Uploads dir: ${uploadsPath}\n`);
});

// Graceful shutdown — closes server and give 10s before force-exit
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal} — shutting down gracefully...`);
  // stop accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error("Error closing server:", err);
      process.exit(1);
    }
    try {
      // close DB connections, worker queues, etc. Add your cleanup here:
      // await db.close();
      console.log("Cleanup complete. Exiting.");
      process.exit(0);
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
      process.exit(1);
    }
  });

  // force exit if not closed in time
  setTimeout(() => {
    console.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

/* -------------------- Export for tests  ------------------------ */
module.exports = { app, server };
