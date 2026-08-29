// backend/utils/geocoder.js
const https = require('https');
const axios = require('axios');
const LoginLog = require('../models/LoginLog');

/**
 * Resolves a text address to latitude and longitude using OpenStreetMap Nominatim.
 * @param {string} addressString - Full address (e.g., "Society name, Locality, City, State, Pincode")
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
async function geocodeAddress(addressString) {
  if (!addressString || !addressString.trim()) return null;

  // 1. Try Photon API (fast, open CORS, no rate limit)
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(addressString)}&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'ResaleExpert-App/1.0' } });
    if (res.ok) {
      const data = await res.json();
      if (data?.features && data.features.length > 0) {
        const coords = data.features[0].geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const lng = parseFloat(coords[0]);
          const lat = parseFloat(coords[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
            return { latitude: lat, longitude: lng };
          }
        }
      }
    }
  } catch (err) {}

  // 2. Nominatim fallback with timeout
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: addressString,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'ResaleExpert-App/1.0 (contact@resaleexpert.com)'
      },
      timeout: 3000
    });

    if (response.data && response.data.length > 0) {
      const first = response.data[0];
      return {
        latitude: parseFloat(first.lat),
        longitude: parseFloat(first.lon)
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding failed for address:", addressString, error.message);
    return null;
  }
}

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
  geocodeAddress,
};
