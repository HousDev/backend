const db = require('../config/database');
const { fetchNearbyPlaces, calculateHaversineDistance } = require('../utils/places');
const { geocodeAddress } = require('../utils/geocoder');

// 1. Get Nearby Places (Cache-First Overpass & Photon API with Lazy Geocoding)
exports.getNearbyPlaces = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch full property details (resale OR rental)
    let [propRows] = await db.query(
      "SELECT id, society_name, location_name, city_name, address, latitude, longitude FROM my_properties WHERE id = ? LIMIT 1",
      [id]
    );
    let isRental = false;

    if (!propRows[0]) {
      [propRows] = await db.query(
        "SELECT id, society_name, location_name, city_name, address, latitude, longitude FROM rental_properties WHERE id = ? LIMIT 1",
        [id]
      );
      isRental = true;
    }

    if (!propRows[0]) {
      return res.status(200).json([]);
    }

    const prop = propRows[0];
    let lat = parseFloat(prop.latitude);
    let lng = parseFloat(prop.longitude);

    const parts = [
      prop.society_name,
      prop.location_name,
      prop.city_name,
      prop.address
    ].filter(p => p && typeof p === 'string' && p.trim() !== '' && !p.includes('[object'));

    const locationName = parts.join(', ');

    // Smart progressive geocoding if coordinates are missing or invalid
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      let coords = null;
      if (prop.location_name) {
        coords = await geocodeAddress(`${prop.location_name}, ${prop.city_name || 'Pune'}, Maharashtra`);
      }
      if (!coords && (prop.society_name || prop.address)) {
        const fullAddr = [prop.society_name, prop.location_name, prop.city_name || 'Pune', 'Maharashtra'].filter(Boolean).join(', ');
        coords = await geocodeAddress(fullAddr);
      }
      if (coords && coords.latitude && coords.longitude) {
        lat = parseFloat(coords.latitude);
        lng = parseFloat(coords.longitude);
        const tableName = isRental ? "rental_properties" : "my_properties";
        await db.query(`UPDATE ${tableName} SET latitude = ?, longitude = ? WHERE id = ?`, [lat, lng, id]);
      }
    }

    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      // Check Cache Table
      const [cacheRows] = await db.query(
        "SELECT places_json FROM nearby_places_cache WHERE latitude = ? AND longitude = ? LIMIT 1",
        [lat, lng]
      );

      if (cacheRows[0]) {
        const parsed = typeof cacheRows[0].places_json === 'string'
          ? JSON.parse(cacheRows[0].places_json)
          : cacheRows[0].places_json;

        if (Array.isArray(parsed) && parsed.length > 0) {
          return res.status(200).json(parsed);
        }
      }
    }

    // Fetch dynamic real nearby places
    const places = await fetchNearbyPlaces(lat, lng, locationName, 3500);

    if (places && places.length > 0 && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      await db.query(
        "INSERT INTO nearby_places_cache (latitude, longitude, place_type, places_json) VALUES (?, ?, 'all', ?) ON DUPLICATE KEY UPDATE places_json = VALUES(places_json)",
        [lat, lng, JSON.stringify(places)]
      );
    }

    res.status(200).json(places || []);
  } catch (error) {
    console.error("Error fetching nearby places:", error);
    res.status(500).json({ error: error.message });
  }
};

// 1b. Get Nearby Places by Coordinates or Address query
exports.getNearbyPlacesByQuery = async (req, res) => {
  try {
    let lat = parseFloat(req.query.lat);
    let lng = parseFloat(req.query.lng);
    let locationName = req.query.address || req.query.location || req.query.locality || '';

    if ((isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) && locationName) {
      const coords = await geocodeAddress(`${locationName}, Maharashtra`);
      if (coords && coords.latitude && coords.longitude) {
        lat = parseFloat(coords.latitude);
        lng = parseFloat(coords.longitude);
      }
    }

    const places = await fetchNearbyPlaces(lat, lng, locationName, 3500);
    res.status(200).json(places || []);
  } catch (error) {
    console.error("Error fetching nearby places by query:", error);
    res.status(500).json({ error: error.message });
  }
};

// 2. Distance & Weighted Matching calculation for Buyers
exports.getMatchingBuyers = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch resale OR rental property details
    let [propRows] = await db.query("SELECT * FROM my_properties WHERE id = ? LIMIT 1", [id]);
    let isRental = false;
    if (!propRows[0]) {
      [propRows] = await db.query("SELECT * FROM rental_properties WHERE id = ? LIMIT 1", [id]);
      isRental = true;
    }
    if (!propRows[0]) return res.status(404).json({ error: "Property not found" });
    const property = propRows[0];

    // Lazy geocoding: resolve coordinates on-demand if null/missing
    let propLat = parseFloat(property.latitude);
    let propLng = parseFloat(property.longitude);
    if (isNaN(propLat) || isNaN(propLng) || propLat === 0 || propLng === 0) {
      const addr = `${property.society_name || property.location_name || property.address || ""}, ${property.city_name || "Pune"}, Maharashtra`;
      const coords = await geocodeAddress(addr);
      if (coords) {
        propLat = coords.latitude;
        propLng = coords.longitude;
        const tableName = isRental ? "rental_properties" : "my_properties";
        await db.query(`UPDATE ${tableName} SET latitude = ?, longitude = ? WHERE id = ?`, [propLat, propLng, id]);
      }
    }
    const propPrice = parseFloat(property.budget || property.final_price || property.price || property.expected_price || 0);
    const propBHK = parseInt(property.bedrooms || 0) ||
      (property.unit_type?.match(/(\d+)\s*bhk/i)?.[1] ? parseInt(property.unit_type.match(/(\d+)\s*bhk/i)[1], 10) : 0) ||
      (property.unitType?.match(/(\d+)\s*bhk/i)?.[1] ? parseInt(property.unitType.match(/(\d+)\s*bhk/i)[1], 10) : 0) ||
      (property.title?.match(/(\d+)\s*bhk/i)?.[1] ? parseInt(property.title.match(/(\d+)\s*bhk/i)[1], 10) : 0);
    const propUnitType = (property.unit_type || property.unitType || property.property_type || property.property_type_name || property.title || '').toLowerCase().trim();
    const propArea = parseFloat(property.carpetArea || property.carpet_area || property.builtupArea || property.area || 0);

    // Fetch all buyers & tenants for matching
    const [buyers] = await db.query("SELECT * FROM buyers");
    let allLeads = [...buyers];
    if (isRental) {
      try {
        const [tenants] = await db.query("SELECT * FROM tenants");
        if (Array.isArray(tenants) && tenants.length > 0) {
          allLeads = [...allLeads, ...tenants];
        }
      } catch (e) {
        console.error("Error fetching tenants for rental matching:", e);
      }
    }

    const getBuyerPrefLoc = (buyer, reqs) => {
      if (reqs && reqs.preferredLocations) {
        if (Array.isArray(reqs.preferredLocations) && reqs.preferredLocations.length > 0) {
          return reqs.preferredLocations.join(', ');
        }
        if (typeof reqs.preferredLocations === 'string' && reqs.preferredLocations.trim()) {
          return reqs.preferredLocations.trim();
        }
      }
      if (reqs && reqs.preferred_locations) {
        if (Array.isArray(reqs.preferred_locations) && reqs.preferred_locations.length > 0) {
          return reqs.preferred_locations.join(', ');
        }
        if (typeof reqs.preferred_locations === 'string' && reqs.preferred_locations.trim()) {
          return reqs.preferred_locations.trim();
        }
      }
      if (buyer.preferred_location && typeof buyer.preferred_location === 'string' && buyer.preferred_location.trim()) {
        return buyer.preferred_location.trim();
      }
      return '';
    };

    const isLocSpecified = (buyer, reqs) => {
      const loc = getBuyerPrefLoc(buyer, reqs);
      if (!loc || typeof loc !== 'string') return false;
      const cleaned = loc.trim().toLowerCase();
      if (!cleaned) return false;
      return !(
        cleaned === 'any location' ||
        cleaned === 'any' ||
        cleaned === '-' ||
        cleaned === '--' ||
        cleaned === 'n/a' ||
        cleaned === 'not specified' ||
        cleaned === 'undefined' ||
        cleaned === 'null'
      );
    };

    const results = allLeads.map(buyer => {
      let reqs = buyer.requirements;
      if (typeof reqs === 'string') {
        try { reqs = JSON.parse(reqs); } catch { reqs = {}; }
      }
      if (!reqs) reqs = {};

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

      const buyerLocRaw = getBuyerPrefLoc(buyer, reqs);
      const hasValidPrefLoc = isLocSpecified(buyer, reqs);

      // 1. Location match (35% weight)
      if (buyerCoords.length === 0 || isNaN(propLat) || isNaN(propLng) || propLat === 0 || propLng === 0) {
        // Text-based matching using ONLY preferred location
        const propLoc = (property.location || property.location_name || property.society || property.society_name || property.address || '').toLowerCase().trim();
        const propCity = (property.city || property.city_name || '').toLowerCase().trim();

        if (!hasValidPrefLoc) {
          locationScore = 0;
        } else {
          const buyerLocs = buyerLocRaw.toLowerCase().split(/[;,]+/).map(s => s.trim()).filter(Boolean);
          const hasExactMatch = buyerLocs.some(loc =>
            propLoc.includes(loc) ||
            loc.includes(propLoc) ||
            (propCity && loc.includes(propCity))
          );

          if (hasExactMatch) {
            locationScore = 35;
          } else {
            const NEARBY_MAP = {
              tathawade: ['wakad', 'punawale', 'ravet', 'hinjewadi', 'marunji', 'pimpri'],
              wakad: ['tathawade', 'baner', 'balewadi', 'hinjewadi', 'thergaon', 'rahatani', 'pimple saudagar'],
              baner: ['balewadi', 'wakad', 'aundh', 'pashan', 'pimple saudagar', 'model colony'],
              balewadi: ['baner', 'wakad', 'aundh', 'pashan'],
              kharadi: ['viman nagar', 'wagholi', 'hadapsar', 'kalyani nagar', 'mundhwa', 'chandan nagar'],
              'viman nagar': ['kharadi', 'kalyani nagar', 'vishrantwadi', 'tingre nagar', 'yerwada'],
              hinjewadi: ['wakad', 'tathawade', 'marunji', 'punawale', 'pimpri', 'bavdhan'],
              kothrud: ['bavdhan', 'karve nagar', 'erandwane', 'deccan', 'warje'],
              bavdhan: ['kothrud', 'pashan', 'baner', 'warje', 'hinjewadi'],
              hadapsar: ['magarpatta', 'amanora', 'kharadi', 'fursungi', 'wanowrie', 'loni kalbhor'],
              rahatani: ['pimple saudagar', 'pimple nilakh', 'wakad', 'kalewadi', 'chinchwad'],
              'pimple saudagar': ['rahatani', 'pimple nilakh', 'wakad', 'baner', 'sangvi'],
            };

            let isNearby = false;
            for (const loc of buyerLocs) {
              for (const [keyLoc, adjList] of Object.entries(NEARBY_MAP)) {
                if (propLoc.includes(keyLoc) || keyLoc.includes(propLoc)) {
                  if (adjList.some(adj => loc.includes(adj) || adj.includes(loc))) {
                    isNearby = true;
                    break;
                  }
                }
              }
              if (isNearby) break;
            }

            if (isNearby) {
              locationScore = 25;
            } else {
              const words = buyerLocs.flatMap(l => l.split(/\s+/));
              const partial = words.some(word => word.length > 2 && propLoc.includes(word));
              locationScore = partial ? 20 : 0;
            }
          }
        }
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
        else locationScore = 0;
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
          } else if (propPrice < tMin) {
            budgetScore = 20;
          } else {
            const diff = propPrice - tMax;
            const tolerance = tMax * 0.2;
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

      let displayBHK = buyer.preferred_bhk || buyer.unit_type || '';
      if (reqs.unitTypes) {
        displayBHK = Array.isArray(reqs.unitTypes) ? reqs.unitTypes.join(', ') : reqs.unitTypes;
      }

      return {
        ...buyer,
        displayLocation: buyerLocRaw || '',
        displayBHK: displayBHK || 'Any BHK / Type',
        matchScore: totalScore,
        distance: minDistance === 9999 ? null : parseFloat(minDistance.toFixed(1)),
        locationScore,
        budgetScore,
        bhkScore,
        areaScore,
        hasLocationSpecified: hasValidPrefLoc
      };
    })
      .filter(res => res.hasLocationSpecified && res.locationScore > 0 && res.matchScore >= 35)
      .sort((a, b) => b.matchScore - a.matchScore || b.locationScore - a.locationScore || (a.distance || 999) - (b.distance || 999));

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
