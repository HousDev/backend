const router = require('express').Router();
const ctrl = require('../controllers/analytics.Controller');
const { authJwt } = require('../middleware');

// Public tracking endpoint (fire-and-forget from frontend)
router.post('/track-event', ctrl.trackEvent);

// Protected CRM & Reporting endpoints
router.get('/timeline/lead/:leadId', authJwt.verifyToken, ctrl.getLeadTimeline);
router.get('/timeline/user/:userId', authJwt.verifyToken, ctrl.getUserTimeline);
router.get('/timeline/guest/:guestId', authJwt.verifyToken, ctrl.getGuestTimeline);
router.get('/timeline/session/:sessionId', authJwt.verifyToken, ctrl.getSessionTimeline);
router.get('/overview', authJwt.verifyToken, ctrl.getOverview);

// WhatsApp stats (existing endpoint)
router.get('/stats', ctrl.getStats);

module.exports = router;
