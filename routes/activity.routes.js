const express = require('express');
const activityController = require('../controllers/activity.controller');
const { verifyToken } = require('../middleware/authJwt');

const router = express.Router();

// Apply authentication to all activity routes
router.use(verifyToken);

// Activity CRUD routes
router.post('/', activityController.create);
router.get('/', activityController.findAll);
router.get('/stats', activityController.getStats);
router.get('/upcoming', activityController.getUpcoming);
router.get('/today', activityController.getToday);
router.get('/:activityId', activityController.findOne);
router.put('/:activityId', activityController.update);
router.delete('/:activityId', activityController.delete);

// Activity management routes
router.patch('/:activityId/complete', activityController.complete);
router.patch('/:activityId/cancel', activityController.cancel);

module.exports = router;