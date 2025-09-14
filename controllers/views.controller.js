// controllers/views.controller.js
const Views = require("../models/views.model");

// Startup diagnostic: show what was exported by the model
console.log('[views.controller] loaded Views keys:', Object.keys(Views || {}).join(', ') || '(none)');
console.log('[property.controller] loaded; Views keys:', Views ? Object.keys(Views).join(',') : '(Views missing)');
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'];
  if (xff && typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return req.ip || null;
}

async function totalViewsHandler(req, res) {
  try {
    if (typeof Views.getTotalViews !== 'function') {
      console.error('[views.controller] ERROR: Views.getTotalViews is not a function', Object.keys(Views || {}));
      return res.status(500).json({ success: false, message: "Views module misconfigured (missing getTotalViews)" });
    }

    console.log('[views.controller] totalViewsHandler called');
    const totals = await Views.getTotalViews();
    return res.json({ success: true, ...totals });
  } catch (err) {
    console.error("totalViewsHandler failed:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function propertyViewsHandler(req, res) {
  try {
    const idRaw = req.params.id;
    const propertyId = Number(idRaw);
    if (!propertyId || Number.isNaN(propertyId)) {
      return res.status(400).json({ success: false, message: "Missing or invalid property id" });
    }

    // compatibility: unique=true returns only unique_views
    const unique = String(req.query.unique || "false").toLowerCase() === "true";

    console.log('[views.controller] propertyViewsHandler called', { propertyId, unique });

    if (unique) {
      if (typeof Views.getPropertyUniqueViews !== "function") {
        console.error('[views.controller] ERROR: Views.getPropertyUniqueViews is not a function', Object.keys(Views || {}));
        return res.status(500).json({ success: false, message: "Views module misconfigured (missing getPropertyUniqueViews)" });
      }
      const uniqueViews = await Views.getPropertyUniqueViews(propertyId);
      return res.json({ success: true, property_id: propertyId, unique_views: uniqueViews });
    } else {
      if (typeof Views.getPropertyViews !== "function") {
        console.error('[views.controller] ERROR: Views.getPropertyViews is not a function', Object.keys(Views || {}));
        return res.status(500).json({ success: false, message: "Views module misconfigured (missing getPropertyViews)" });
      }
      const totals = await Views.getPropertyViews(propertyId);
      // totals has { total_views, unique_views }
      return res.json({ success: true, property_id: propertyId, ...totals });
    }
  } catch (err) {
    console.error("propertyViewsHandler failed:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function topViewsHandler(req, res) {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
    const unique = String(req.query.unique || "false").toLowerCase() === "true";

    if (typeof Views.getTopViews !== "function") {
      console.error('[views.controller] ERROR: Views.getTopViews is not a function', Object.keys(Views || {}));
      return res.status(500).json({ success: false, message: "Views module misconfigured (missing getTopViews)" });
    }

    console.log('[views.controller] topViewsHandler', { limit, unique });
    const rows = await Views.getTopViews({ limit, unique });
    return res.json({ success: true, rows });
  } catch (err) {
    console.error("topViewsHandler failed:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function bottomViewsHandler(req, res) {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
    const unique = String(req.query.unique || "false").toLowerCase() === "true";

    if (typeof Views.getBottomViews !== "function") {
      console.error('[views.controller] ERROR: Views.getBottomViews is not a function', Object.keys(Views || {}));
      return res.status(500).json({ success: false, message: "Views module misconfigured (missing getBottomViews)" });
    }

    console.log('[views.controller] bottomViewsHandler', { limit, unique });
    const rows = await Views.getBottomViews({ limit, unique });
    return res.json({ success: true, rows });
  } catch (err) {
    console.error("bottomViewsHandler failed:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
async function recordPropertyViewHandler(req, res) {
  try {
    const idRaw = req.params.id;
    const propertyId = idRaw ? Number(String(idRaw).replace(/[^0-9]/g, '')) : null;

    if (!propertyId || Number.isNaN(propertyId)) {
      return res.status(400).json({ success: false, message: 'Missing or invalid property id' });
    }

    // safe header parsing
    const ip = getClientIp(req);
    const userAgent = req.get ? (req.get('User-Agent') || null) : (req.headers && req.headers['user-agent']) || null;
    const referrer = req.get ? (req.get('Referrer') || req.get('Referer') || null) : (req.headers && (req.headers.referer || req.headers.referrer)) || null;

    // canonical payload for model
    const payload = {
      property_id: propertyId,
      slug: req.body?.slug ?? null,
      dedupe_key: req.body?.dedupe_key ?? req.body?.dedupeKey ?? null,
      session_id: req.body?.session_id ?? req.body?.sessionId ?? null,
      source: req.body?.source ?? 'client',
      path: (req.body?.path ?? (req.originalUrl || req.path)) || null,
      referrer,
      ip,
      user_agent: userAgent,
      minutes_window: Number(req.body?.minutes_window ?? req.body?.windowMinutes ?? 1),
      event_type: 'view',
      // keep raw body for debugging if needed (optional)
      // raw_body: req.body
    };

    if (!Views || typeof Views.recordView !== 'function') {
      console.error('[recordPropertyViewHandler] Views.recordView missing - Views keys:', Views ? Object.keys(Views) : '(no Views)');
      return res.status(500).json({ success: false, message: 'Server misconfiguration (views model missing)' });
    }

    const result = await Views.recordView(payload);
    // normalize result
    const recorded = !!(result && result.inserted);
    return res.json({ success: true, recorded, meta: result?.meta ?? {}, deduped: result?.meta?.deduped ?? false });
  } catch (err) {
    console.error('recordPropertyViewHandler failed:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}


async function recordViewHandler(req, res) {
  try {
    // generic record endpoint — property_id optional (may be null if using slug)
    const propertyId = req.body?.property_id ? Number(req.body.property_id) : null;
    const slug = req.body?.slug ?? req.query?.slug ?? null;

    const ip = getClientIp(req);
    const userAgent = req.get ? (req.get('User-Agent') || null) : (req.headers && req.headers['user-agent']) || null;
    const referrer = req.get ? (req.get('Referrer') || req.get('Referer') || null) : (req.headers && (req.headers.referer || req.headers.referrer)) || null;

    const payload = {
      property_id: propertyId,
      slug,
      dedupe_key: req.body?.dedupe_key ?? req.body?.dedupeKey ?? null,
      session_id: req.body?.session_id ?? req.body?.sessionId ?? null,
      source: req.body?.source ?? 'client',
      path: (req.body?.path ?? (req.originalUrl || req.path)) || null,
      referrer,
      ip,
      user_agent: userAgent,
      minutes_window: Number(req.body?.minutes_window ?? req.body?.windowMinutes ?? 1),
      event_type: 'view',
    };

    if (!Views || typeof Views.recordView !== 'function') {
      console.error('[recordViewHandler] Views.recordView missing - Views keys:', Views ? Object.keys(Views) : '(no Views)');
      return res.status(500).json({ success: false, message: 'Server misconfiguration (views model missing)' });
    }

    const result = await Views.recordView(payload);
    const recorded = !!(result && result.inserted);

    return res.json({ success: true, recorded, meta: result?.meta ?? {}, deduped: result?.meta?.deduped ?? false });
  } catch (err) {
    console.error('recordViewHandler failed:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
module.exports = {
  totalViewsHandler,
  propertyViewsHandler,
  topViewsHandler,
  bottomViewsHandler,
  recordViewHandler,
  recordPropertyViewHandler,
};
