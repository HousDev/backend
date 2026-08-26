// backend/utils/geocoder.js
const https = require('https');
const LoginLog = require('../models/LoginLog');

/**
 * Non-blocking reverse geocoding using OpenStreetMap Nominatim API
 */
function reverseGeocodeNonBlocking({ logId, latitude, longitude }) {
  if (!logId || !latitude || !longitude) return;

  setImmediate(async () => {
    try {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;

      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'ResaleExpertApp/1.0 (contact@resaleexpert.com)',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', async () => {
            try {
              if (res.statusCode === 200) {
                const parsed = JSON.parse(data);
                const displayName = parsed.display_name || parsed.name || null;
                if (displayName) {
                  await LoginLog.updateAddress(logId, displayName);
                }
              }
            } catch (err) {
              console.error('Error parsing geocoder response:', err.message);
            }
          });
        }
      );

      req.on('error', (err) => {
        console.error('Geocoder HTTP request error:', err.message);
      });

      req.setTimeout(4000, () => {
        req.destroy();
      });
    } catch (err) {
      console.error('Non-blocking reverse geocoding error:', err.message);
    }
  });
}

module.exports = {
  reverseGeocodeNonBlocking,
};
