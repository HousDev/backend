const axios = require('axios');

/**
 * Calculates distance in kilometers between two coordinates using the Haversine formula.
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Queries OpenStreetMap Overpass API for schools, hospitals, transit, and malls.
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} radius - Radius in meters (default 3000m)
 * @returns {Promise<Array>}
 */
async function fetchNearbyPlaces(lat, lng, radius = 3000) {
  const query = `[out:json];(
    node(around:${radius},${lat},${lng})[amenity~"school|hospital|university|college"];
    node(around:${radius},${lat},${lng})[shop~"mall|supermarket"];
    node(around:${radius},${lat},${lng})[highway~"bus_stop"];
    node(around:${radius},${lat},${lng})[railway~"station|subway_entrance"];
  );out;`;

  try {
    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 10000 // 10s timeout
    });

    if (response.data && response.data.elements) {
      return response.data.elements.map(el => {
        const dist = calculateHaversineDistance(lat, lng, el.lat, el.lon);
        return {
          name: el.tags.name || el.tags.amenity || el.tags.shop || el.tags.highway || 'Landmark',
          distance: parseFloat(dist.toFixed(2)),
          unit: 'km',
          type: el.tags.amenity || el.tags.shop || el.tags.highway || 'landmark'
        };
      }).sort((a, b) => a.distance - b.distance);
    }
    return [];
  } catch (error) {
    console.error("Overpass Places API failed:", error.message);
    return [];
  }
}

module.exports = { fetchNearbyPlaces, calculateHaversineDistance };
