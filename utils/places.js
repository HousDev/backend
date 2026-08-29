const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

function classifyCategory(amenity = '', shop = '', railway = '', highway = '', leisure = '', name = '') {
  const am = String(amenity).toLowerCase();
  const sh = String(shop).toLowerCase();
  const rw = String(railway).toLowerCase();
  const hw = String(highway).toLowerCase();
  const ls = String(leisure).toLowerCase();
  const nm = String(name).toLowerCase();

  if (['school', 'college', 'university', 'kindergarten', 'academy', 'institute', 'vidya', 'niketan', 'tuition'].some(k => am.includes(k) || nm.includes(k))) {
    return { category: 'education', typeName: nm.includes('school') ? 'School' : nm.includes('college') ? 'College' : 'Educational Institute' };
  }
  if (['hospital', 'clinic', 'pharmacy', 'doctor', 'chemist', 'medical', 'dental', 'health', 'care'].some(k => am.includes(k) || nm.includes(k))) {
    return { category: 'healthcare', typeName: nm.includes('hospital') ? 'Multi-Specialty Hospital' : nm.includes('clinic') || nm.includes('dental') ? 'Clinic' : 'Healthcare Facility' };
  }
  if (rw || ['bus_stop', 'station', 'metro', 'train', 'airport', 'terminal', 'depot', 'stop'].some(k => hw.includes(k) || nm.includes(k) || rw.includes(k))) {
    return { category: 'transit', typeName: nm.includes('airport') ? 'Airport' : nm.includes('metro') ? 'Metro Station' : nm.includes('station') ? 'Train Station' : 'Bus Stop / Transit' };
  }
  if (sh || ['mall', 'supermarket', 'mart', 'bazaar', 'store', 'market', 'center', 'plaza'].some(k => sh.includes(k) || nm.includes(k))) {
    return { category: 'shopping', typeName: nm.includes('mall') ? 'Shopping Mall' : 'Supermarket & Retail' };
  }
  let typeName = 'Restaurant & Dining';
  if (ls || nm.includes('park') || nm.includes('garden')) typeName = 'Park & Recreation';
  else if (am.includes('bank') || am.includes('atm') || nm.includes('bank') || nm.includes('atm')) typeName = 'Bank & ATM';
  else if (nm.includes('park') || nm.includes('tower') || nm.includes('it park') || nm.includes('tech')) typeName = 'Business / IT Park';

  return { category: 'dining', typeName };
}

const { geocodeAddress } = require('./geocoder');

/**
 * Fetch dynamic real nearby places for a given location / coordinates using Photon & Overpass APIs
 */
async function fetchNearbyPlaces(lat, lng, locationName = '', radius = 3500) {
  const placesMap = new Map();

  let targetLat = parseFloat(lat) || 0;
  let targetLng = parseFloat(lng) || 0;

  // Clean locationName into locality string
  let cleanLocality = (locationName || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && !s.includes('[object') && !/^\d{6}$/.test(s))[0] || '';

  // Auto-geocode locationName if lat/lng are missing or 0
  if ((targetLat === 0 || targetLng === 0) && locationName) {
    try {
      const fullLoc = (locationName.toLowerCase().includes('maharashtra') || locationName.toLowerCase().includes('pune') || locationName.toLowerCase().includes('mumbai'))
        ? locationName
        : `${locationName}, Pune, Maharashtra`;
      const coords = await geocodeAddress(fullLoc);
      if (coords && coords.latitude && coords.longitude) {
        targetLat = parseFloat(coords.latitude);
        targetLng = parseFloat(coords.longitude);
      }
    } catch (err) {}
  }

  const queryCategories = [
    { cat: 'education', term: 'school' },
    { cat: 'education', term: 'college' },
    { cat: 'healthcare', term: 'hospital' },
    { cat: 'healthcare', term: 'clinic' },
    { cat: 'transit', term: 'station' },
    { cat: 'transit', term: 'bus stop' },
    { cat: 'shopping', term: 'mall' },
    { cat: 'shopping', term: 'supermarket' },
    { cat: 'dining', term: 'restaurant' },
    { cat: 'dining', term: 'park' }
  ];

  // 1. Query Photon API (OSM-backed real landmark search)
  for (const q of queryCategories) {
    try {
      const searchQuery = cleanLocality ? `${cleanLocality} ${q.term}` : q.term;
      let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=6`;
      if (targetLat !== 0 && targetLng !== 0) {
        url += `&lat=${targetLat}&lon=${targetLng}`;
      }

      const res = await fetch(url, { headers: { 'User-Agent': 'PropertyApp/1.0' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.features) {
          for (const feat of data.features) {
            const name = feat.properties?.name;
            if (!name || name.trim().length < 3) continue;

            const lowerName = name.toLowerCase().trim();
            if (['school', 'college', 'hospital', 'park', 'bus stop', 'mall', 'bank', 'atm', 'station', 'road'].includes(lowerName)) continue;

            const pLat = feat.geometry?.coordinates?.[1];
            const pLng = feat.geometry?.coordinates?.[0];

            let distKm = 1.0;
            if (targetLat !== 0 && targetLng !== 0 && pLat && pLng) {
              distKm = calculateHaversineDistance(targetLat, targetLng, pLat, pLng);
            }

            if (distKm > 15.0) continue;

            if (!placesMap.has(lowerName)) {
              const { category, typeName } = classifyCategory(
                feat.properties.osm_value || '',
                feat.properties.osm_key === 'shop' ? feat.properties.osm_value : '',
                feat.properties.osm_key === 'railway' ? feat.properties.osm_value : '',
                feat.properties.osm_key === 'highway' ? feat.properties.osm_value : '',
                feat.properties.osm_key === 'leisure' ? feat.properties.osm_value : '',
                name
              );

              placesMap.set(lowerName, {
                name: name.trim(),
                category: category || q.cat,
                type: typeName,
                distance: parseFloat(distKm.toFixed(1)),
                unit: 'km',
                lat: pLat,
                lng: pLng
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Photon query error:', e.message);
    }
  }

  // 2. Overpass API fallback if Photon yielded fewer than 5 places and lat/lng are non-zero
  if (placesMap.size < 5 && targetLat !== 0 && targetLng !== 0) {
    const query = `[out:json][timeout:10];(
      node["amenity"~"school|college|university|hospital|clinic|pharmacy|restaurant|cafe|bank|atm|bus_station"](around:${radius},${targetLat},${targetLng});
      node["shop"~"supermarket|mall|department_store"](around:${radius},${targetLat},${targetLng});
      node["railway"~"station|subway_entrance|halt"](around:${radius},${targetLat},${targetLng});
      node["highway"~"bus_stop|platform"](around:${radius},${targetLat},${targetLng});
      way["amenity"~"school|college|hospital|clinic|restaurant|bank"](around:${radius},${targetLat},${targetLng});
      way["shop"~"supermarket|mall"](around:${radius},${targetLat},${targetLng});
    );out center 50;`;

    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://z.overpass-api.de/api/interpreter'
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'RealEstateApp/1.0'
          },
          body: 'data=' + encodeURIComponent(query)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.elements) {
            for (const el of data.elements) {
              const name = el.tags?.name || el.tags?.['name:en'];
              if (!name) continue;
              const lowerName = name.toLowerCase().trim();
              if (placesMap.has(lowerName)) continue;

              const itemLat = el.lat || el.center?.lat;
              const itemLon = el.lon || el.center?.lon;
              if (!itemLat || !itemLon) continue;

              const dist = calculateHaversineDistance(targetLat, targetLng, itemLat, itemLon);
              if (dist > 15.0) continue;

              const { category, typeName } = classifyCategory(
                el.tags.amenity || '',
                el.tags.shop || '',
                el.tags.railway || '',
                el.tags.highway || '',
                el.tags.leisure || '',
                name
              );

              placesMap.set(lowerName, {
                name: name.trim(),
                category,
                type: typeName,
                distance: parseFloat(dist.toFixed(1)),
                unit: 'km',
                lat: itemLat,
                lng: itemLon
              });
            }
            if (placesMap.size >= 5) break;
          }
        }
      } catch (err) {}
    }
  }

  const results = Array.from(placesMap.values()).sort((a, b) => a.distance - b.distance);
  return results;
}

module.exports = { fetchNearbyPlaces, calculateHaversineDistance };

