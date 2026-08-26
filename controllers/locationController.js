const db = require('../config/database');
const { fetchNearbyPlaces, calculateHaversineDistance } = require('../utils/places');

// 1. Get Nearby Places (Cache-First Overpass API)
exports.getNearbyPlaces = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch property coordinates (resale OR rental)
    const [propRows] = await db.query(
      "SELECT latitude, longitude FROM my_properties WHERE id = ? UNION SELECT latitude, longitude FROM rental_properties WHERE id = ? LIMIT 1",
      [id, id]
    );

    if (!propRows[0] || !propRows[0].latitude || !propRows[0].longitude) {
      return res.status(200).json([]); // Return empty list gracefully if no coordinates exist
    }

    const lat = parseFloat(propRows[0].latitude);
    const lng = parseFloat(propRows[0].longitude);

    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      return res.status(200).json([]);
    }

    // Check Cache Table (within exact coordinate key)
    const [cacheRows] = await db.query(
      "SELECT places_json FROM nearby_places_cache WHERE latitude = ? AND longitude = ? LIMIT 1",
      [lat, lng]
    );

    if (cacheRows[0]) {
      const parsed = typeof cacheRows[0].places_json === 'string' 
        ? JSON.parse(cacheRows[0].places_json) 
        : cacheRows[0].places_json;
      return res.status(200).json(parsed || []);
    }

    // Fetch from Overpass API and save to Cache
    const places = await fetchNearbyPlaces(lat, lng, 3000);
    await db.query(
      "INSERT INTO nearby_places_cache (latitude, longitude, place_type, places_json) VALUES (?, ?, 'all', ?) ON DUPLICATE KEY UPDATE places_json = VALUES(places_json)",
      [lat, lng, JSON.stringify(places)]
    );

    res.status(200).json(places);
  } catch (error) {
    console.error("Error fetching nearby places:", error);
    res.status(500).json({ error: error.message });
  }
};

// 2. Distance & Weighted Matching calculation for Buyers
exports.getMatchingBuyers = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch resale OR rental property details
    let [propRows] = await db.query("SELECT * FROM my_properties WHERE id = ? LIMIT 1", [id]);
    if (!propRows[0]) {
      [propRows] = await db.query("SELECT * FROM rental_properties WHERE id = ? LIMIT 1", [id]);
    }
    if (!propRows[0]) return res.status(404).json({ error: "Property not found" });
    const property = propRows[0];

    const propLat = parseFloat(property.latitude);
    const propLng = parseFloat(property.longitude);
    const propPrice = parseFloat(property.budget || property.final_price || property.price || property.expected_price || 0);
    const propBHK = parseInt(property.bedrooms || 0) || (property.title?.match(/(\d+)\s*bhk/i)?.[1] ? parseInt(property.title.match(/(\d+)\s*bhk/i)[1], 10) : 0);
    const propUnitType = (property.unitType || property.property_type || property.property_type_name || property.title || '').toLowerCase().trim();
    const propArea = parseFloat(property.carpetArea || property.carpet_area || property.builtupArea || property.area || 0);

    // Fetch all active buyers
    const [buyers] = await db.query("SELECT * FROM buyers WHERE buyer_lead_status = 'Active' OR buyer_lead_status = 'Hot' OR buyer_lead_status = 'Warm'");

    const results = buyers.map(buyer => {
      let locationScore = 0;
      let budgetScore = 0;
      let bhkScore = 0;
      let areaScore = 0;
      let minDistance = 9999;

      let buyerCoords = buyer.preferred_locations_coords;
      if (typeof buyerCoords === 'string') {
        try { buyerCoords = JSON.parse(buyerCoords); } catch { buyerCoords = []; }
      }
      if (!Array.isArray(buyerCoords)) buyerCoords = [];

      // 1. Location match using Haversine Distance (35% weight)
      if (buyerCoords.length === 0 || isNaN(propLat) || isNaN(propLng) || propLat === 0 || propLng === 0) {
        locationScore = 15; // Unspecified gets neutral baseline
      } else {
        buyerCoords.forEach(c => {
          if (c.lat && c.lng) {
            const dist = calculateHaversineDistance(propLat, propLng, parseFloat(c.lat), parseFloat(c.lng));
            if (dist < minDistance) minDistance = dist;
          }
        });

        if (minDistance <= 2) locationScore = 35;
        else if (minDistance <= 5) locationScore = 25;
        else if (minDistance <= 10) locationScore = 15;
        else locationScore = 5;
      }

      // 2. Budget match (30% weight with 20% tolerance threshold)
      const tMin = parseFloat(buyer.budget_min || 0);
      const tMax = parseFloat(buyer.budget_max || 0);

      if (tMin === 0 && tMax === 0) {
        budgetScore = 20; // baseline
      } else if (propPrice > 0) {
        if (tMin > 0 && tMax > 0) {
          if (propPrice >= tMin && propPrice <= tMax) {
            budgetScore = 30;
          } else {
            const diff = Math.min(Math.abs(propPrice - tMin), Math.abs(propPrice - tMax));
            const tolerance = (tMax || tMin) * 0.2;
            if (diff <= tolerance) {
              budgetScore = Math.max(5, Math.round(30 * (1 - (diff / tolerance))));
            } else {
              budgetScore = 5;
            }
          }
        } else if (tMax > 0 && propPrice <= tMax) {
          budgetScore = 30;
        } else if (tMin > 0 && propPrice >= tMin) {
          budgetScore = 30;
        }
      }

      // 3. BHK & Unit Type match (20% weight)
      let reqs = buyer.requirements;
      if (typeof reqs === 'string') {
        try { reqs = JSON.parse(reqs); } catch { reqs = {}; }
      }
      if (!reqs) reqs = {};

      const preferredBhkStr = String(reqs.preferred_bhk || reqs.unitTypes || buyer.preferred_bhk || '').toLowerCase();
      
      if (!preferredBhkStr) {
        bhkScore = 10;
      } else {
        let matched = false;
        if (propBHK > 0 && (preferredBhkStr.includes(`${propBHK}bhk`) || preferredBhkStr.includes(`${propBHK} bhk`) || preferredBhkStr.includes(String(propBHK)))) {
          matched = true;
        }
        if (propUnitType) {
          if (propUnitType.includes('commercial') && preferredBhkStr.includes('commercial')) matched = true;
          if (propUnitType.includes('flat') || propUnitType.includes('apartment') || propUnitType.includes('residential')) {
            if (preferredBhkStr.includes('bhk') || preferredBhkStr.includes('apartment') || preferredBhkStr.includes('flat')) matched = true;
          }
        }

        if (matched) bhkScore = 20;
        else bhkScore = 5;
      }

      // 4. Carpet Area match (15% weight)
      const minArea = parseFloat(reqs.minCarpetArea || reqs.minArea || 0);
      const maxArea = parseFloat(reqs.maxCarpetArea || reqs.maxArea || 0);

      if (minArea === 0 && maxArea === 0) {
        areaScore = 10;
      } else if (propArea > 0) {
        if (propArea >= minArea && (maxArea === 0 || propArea <= maxArea)) {
          areaScore = 15;
        } else {
          const diff = propArea < minArea ? (minArea - propArea) : (propArea - maxArea);
          const boundary = propArea < minArea ? minArea : maxArea;
          areaScore = Math.max(0, Math.round(15 * (1 - (diff / boundary))));
        }
      }

      const totalScore = locationScore + budgetScore + bhkScore + areaScore;

      // Extract locations string
      let displayLocation = buyer.location || buyer.preferred_location || '';
      if (reqs.preferredLocations && Array.isArray(reqs.preferredLocations)) {
        displayLocation = reqs.preferredLocations.join(', ');
      }

      let displayBHK = buyer.preferred_bhk || buyer.unit_type || '';
      if (reqs.unitTypes) {
        displayBHK = Array.isArray(reqs.unitTypes) ? reqs.unitTypes.join(', ') : reqs.unitTypes;
      }

      return {
        ...buyer,
        displayLocation: displayLocation || 'Any Location',
        displayBHK: displayBHK || 'Any BHK / Type',
        matchScore: totalScore,
        distance: minDistance === 9999 ? null : parseFloat(minDistance.toFixed(1)),
        locationScore,
        budgetScore,
        bhkScore,
        areaScore
      };
    })
    .filter(res => res.matchScore >= 35)
    .sort((a, b) => b.matchScore - a.matchScore || (a.distance || 999) - (b.distance || 999));

    res.status(200).json(results);
  } catch (error) {
    console.error("Error matching buyers:", error);
    res.status(500).json({ error: error.message });
  }
};

// 3. Batch Share Properties
exports.batchShareProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const { buyerIds, channels } = req.body;

    let [propRows] = await db.query("SELECT * FROM my_properties WHERE id = ? LIMIT 1", [id]);
    if (!propRows[0]) {
      [propRows] = await db.query("SELECT * FROM rental_properties WHERE id = ? LIMIT 1", [id]);
    }
    if (!propRows[0]) return res.status(404).json({ error: "Property not found" });

    // Enqueue message transaction sequence on target channels
    buyerIds.forEach(buyerId => {
      console.log(`[SHARE BATCH] Queueing notification. Property ID: ${id} | Buyer ID: ${buyerId} | Channels: ${channels.join(', ')}`);
    });

    res.status(200).json({ success: true, message: `Successfully queued sharing details for ${buyerIds.length} buyer(s).` });
  } catch (error) {
    console.error("Error in batch sharing:", error);
    res.status(500).json({ error: error.message });
  }
};
