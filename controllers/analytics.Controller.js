const Analytics = require('../models/analytics.Model');
const UserActivityEvent = require('../models/userActivityEvent.model');

// Existing whatsapp/contacts stats
exports.getStats = async (req, res) => {
  try {
    const stats = await Analytics.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Public Non-Blocking Event Tracker
 * POST /api/analytics/track-event
 */
exports.trackEvent = async (req, res) => {
  try {
    const {
      guest_id,
      user_id = null,
      lead_id = null,
      source = 'website',
      session_id,
      event_type,
      event_name,
      page_url,
      property_id = null,
      payload = null,
    } = req.body;

    // Use JWT authenticated user ID if available on req.user
    const resolvedUserId = req.user && req.user.id ? req.user.id : user_id;

    // Full IP Address extraction (handles reverse proxies, CF headers, IPv4/IPv6)
    let rawIp =
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.headers['cf-connecting-ip'] ||
      req.socket.remoteAddress ||
      req.ip ||
      '';

    let clientIp = String(rawIp).trim();
    if (clientIp.includes(',')) {
      clientIp = clientIp.split(',')[0].trim();
    }
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.replace('::ffff:', '');
    }
    if (clientIp === '::1') {
      clientIp = '127.0.0.1';
    }

    const userAgent = req.headers['user-agent'] || null;

    // Asynchronously log the event
    await UserActivityEvent.recordEvent({
      guest_id,
      user_id: resolvedUserId,
      lead_id,
      source,
      session_id,
      event_type,
      event_name,
      page_url,
      property_id,
      payload,
      ip_address: clientIp || null,
      user_agent: userAgent,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    // Fail silently with 200 so visitor experience is never interrupted
    return res.status(200).json({ success: false, error: err.message });
  }
};

/**
 * Get full 360 chronological activity timeline for a Lead
 * GET /api/analytics/timeline/lead/:leadId
 */
exports.getLeadTimeline = async (req, res) => {
  try {
    const { leadId } = req.params;
    const timeline = await UserActivityEvent.getTimelineByLead(leadId);
    return res.status(200).json({ success: true, data: timeline });
  } catch (err) {
    console.error('getLeadTimeline error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get full chronological activity timeline for a User
 * GET /api/analytics/timeline/user/:userId
 */
exports.getUserTimeline = async (req, res) => {
  try {
    const { userId } = req.params;
    const timeline = await UserActivityEvent.getTimelineByUser(userId);
    return res.status(200).json({ success: true, data: timeline });
  } catch (err) {
    console.error('getUserTimeline error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get activity timeline for an anonymous Guest
 * GET /api/analytics/timeline/guest/:guestId
 */
exports.getGuestTimeline = async (req, res) => {
  try {
    const { guestId } = req.params;
    const timeline = await UserActivityEvent.getTimelineByGuest(guestId);
    return res.status(200).json({ success: true, data: timeline });
  } catch (err) {
    console.error('getGuestTimeline error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get activity timeline for a specific Session
 * GET /api/analytics/timeline/session/:sessionId
 */
exports.getSessionTimeline = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const timeline = await UserActivityEvent.getTimelineBySession(sessionId);
    return res.status(200).json({ success: true, data: timeline });
  } catch (err) {
    console.error('getSessionTimeline error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get overview stats & anonymous visitor analytics
 * GET /api/analytics/overview
 */
exports.getOverview = async (req, res) => {
  try {
    const { dateRange = '30d', startDate, endDate } = req.query;
    const data = await UserActivityEvent.getOverviewStats({ dateRange, startDate, endDate });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('getOverview error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
