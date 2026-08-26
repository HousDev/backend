const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

router.get('/properties/:id/nearby', locationController.getNearbyPlaces);
router.get('/properties/:id/matching-buyers', locationController.getMatchingBuyers);
router.post('/properties/:id/share', locationController.batchShareProperty);

module.exports = router;
