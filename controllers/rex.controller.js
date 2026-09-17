// backend/controllers/rex.controller.js
const RexSessionModel = require("../models/rexSession.model");
const rexAiService = require("../services/rexAiService");
const Property = require("../models/Property");
const Lead = require("../models/Lead");
const Buyer = require("../models/Buyer");
const PropertyVisit = require("../models/PropertyVisit");
const ChatModel = require("../models/chat.model");
const db = require("../config/database");
const { resolveDynamicExecutive } = require("../utils/executiveResolver");

/**
 * Helper to sanitize property objects for public chat presentation
 */
function sanitizePropertyForChat(p) {
  let photos = [];
  if (Array.isArray(p.photos)) {
    photos = p.photos;
  } else if (typeof p.photos === "string") {
    try {
      const parsed = JSON.parse(p.photos);
      photos = Array.isArray(parsed) ? parsed : [p.photos];
    } catch {
      photos = p.photos ? [p.photos] : [];
    }
  }

  const subType = p.property_subtype_name || p.property_type_name || p.property_subtype || p.property_type || "Apartment";
  const loc = p.location_name || p.location || "";
  const ut = p.unit_type || "";

  let cleanTitle = p.title || "";
  // Strip any legacy society name like "in Others" or "in SocietyName"
  if (cleanTitle.includes(" in ") && loc) {
    cleanTitle = cleanTitle.replace(/\s+in\s+.*$/i, ` in ${loc}`);
  } else if (!cleanTitle || cleanTitle.toLowerCase().includes("others")) {
    cleanTitle = [ut, subType, loc ? `in ${loc}` : ""].filter(Boolean).join(" ").trim() || "Verified Property";
  }

  return {
    id: p.id,
    slug: p.slug || `${p.id}`,
    title: cleanTitle,
    property_type: p.property_type_name || null,
    property_subtype: p.property_subtype_name || null,
    unit_type: p.unit_type || null,
    bedrooms: p.bedrooms || null,
    bathrooms: p.bathrooms || null,
    carpet_area: p.carpet_area || p.builtup_area || null,
    city: p.city_name || null,
    location: p.location_name || null,
    society: null, // Society name hidden for buyer privacy
    price: Number(p.price || p.final_price || p.budget || 0),
    photos,
    assigned_to: p.assigned_to || null,
    is_featured: Boolean(p.is_featured),
    is_premium: Boolean(p.is_premium),
  };
}

function formatPrice(val) {
  const num = Number(val) || 0;
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(0)} Lakh`;
  }
  if (num > 0) {
    return `₹${num.toLocaleString("en-IN")}`;
  }
  return "₹0";
}

function sanitizeRentalPropertyForChat(p) {
  let photos = [];
  if (Array.isArray(p.photos)) {
    photos = p.photos;
  } else if (typeof p.photos === "string") {
    try {
      const parsed = JSON.parse(p.photos);
      photos = Array.isArray(parsed) ? parsed : [p.photos];
    } catch {
      photos = p.photos ? [p.photos] : [];
    }
  }

  const subType = p.property_subtype_name || p.property_type_name || "Rental Flat";
  const loc = p.location_name || "";
  const ut = p.unit_type || (p.bedrooms ? `${p.bedrooms} BHK` : "Rental Flat");
  const rentVal = Number(p.monthly_rent) || 0;
  const depositVal = Number(p.security_deposit) || 0;

  const cleanTitle = p.society_name
    ? `${ut} Flat at ${p.society_name}`
    : [ut, subType, loc ? `in ${loc}` : ""].filter(Boolean).join(" ").trim() || "Verified Rental Home";

  return {
    id: p.id,
    slug: p.slug || `${p.id}`,
    title: cleanTitle,
    property_type: p.property_type_name || "Rental",
    property_subtype: p.property_subtype_name || null,
    unit_type: ut,
    bedrooms: p.bedrooms || null,
    bathrooms: p.bathrooms || null,
    carpet_area: p.carpet_area ? `${p.carpet_area} sq ft` : null,
    city: p.city_name || "Pune",
    location: loc || "Pune",
    society: p.society_name || null,
    price: rentVal,
    price_display: rentVal > 0 ? `₹${rentVal.toLocaleString("en-IN")}/mo` : "Rent on Request",
    photos,
    image: photos[0] || "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    listing_type: "rent",
    monthly_rent: rentVal,
    security_deposit: depositVal,
    owner_id: p.owner_id || null,
    owner_name: p.owner_name_joined || p.owner_name || "Property Owner",
    is_featured: Boolean(p.is_featured),
    is_premium: Boolean(p.is_premium),
  };
}

async function searchRentalPropertiesPaginated(filters = {}, limit = 5, offset = 0) {
  try {
    const { city, locations, unitType, bedrooms, budgetMax } = filters;
    const conditions = ["rp.is_public = 1 AND (rp.status = 'Available' OR rp.status IS NULL OR rp.status = '')"];
    const params = [];

    if (city) {
      conditions.push("LOWER(rp.city_name) LIKE ?");
      params.push(`%${String(city).toLowerCase().trim()}%`);
    }

    if (Array.isArray(locations) && locations.length > 0) {
      const locOr = locations.map(() => "(LOWER(rp.location_name) LIKE ? OR LOWER(rp.society_name) LIKE ?)").join(" OR ");
      conditions.push(`(${locOr})`);
      locations.forEach((l) => {
        const clean = `%${String(l).toLowerCase().trim()}%`;
        params.push(clean, clean);
      });
    }

    if (bedrooms) {
      conditions.push("rp.bedrooms = ?");
      params.push(Number(bedrooms));
    } else if (unitType) {
      conditions.push("LOWER(rp.unit_type) = ?");
      params.push(String(unitType).toLowerCase().trim());
    }

    if (budgetMax) {
      conditions.push("rp.monthly_rent <= ?");
      params.push(Number(budgetMax));
    }

    const whereClause = conditions.join(" AND ");
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const safeOffset = Math.max(0, Number(offset) || 0);

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM rental_properties rp WHERE ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await db.query(
      `SELECT rp.*,
              o.name AS owner_name_joined, o.phone AS owner_phone_joined,
              o.whatsapp AS owner_whatsapp_joined, o.email AS owner_email_joined
       FROM rental_properties rp
       LEFT JOIN owners o ON rp.owner_id = o.id
       WHERE ${whereClause}
       ORDER BY rp.id DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );

    return {
      properties: rows || [],
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < total,
      remaining: Math.max(0, total - (safeOffset + safeLimit)),
    };
  } catch (err) {
    console.error("searchRentalPropertiesPaginated error:", err);
    return { properties: [], total: 0, limit, offset, hasMore: false, remaining: 0 };
  }
}

/**
 * Helper to resolve seller property and assigned executive
 */
async function resolveSellerPropertyAndExecutive({ userId, userPhone, userEmail, propertyId, societyName }) {
  try {
    let prop = null;

    // 1. If explicit propertyId is provided
    if (propertyId) {
      const [rows] = await db.query(
        `SELECT p.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM my_properties p
         LEFT JOIN users e ON p.assigned_to = e.id
         WHERE p.id = ? LIMIT 1`,
        [propertyId]
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    // 2. Lookup by userId (linked via created_by, seller_id, or seller matching user email/phone)
    if (!prop && userId) {
      const [rows] = await db.query(
        `SELECT p.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM my_properties p
         LEFT JOIN users e ON p.assigned_to = e.id
         LEFT JOIN sellers s ON p.seller_id = s.id
         LEFT JOIN users u ON u.id = ?
         WHERE p.created_by = ? 
            OR p.seller_id = ? 
            OR (u.email IS NOT NULL AND s.email = u.email) 
            OR (u.phone IS NOT NULL AND s.phone = u.phone)
         ORDER BY p.id DESC LIMIT 1`,
        [userId, userId, userId]
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    // 3. Lookup by phone or email
    const cleanPhone = userPhone ? String(userPhone).replace(/\D/g, "").slice(-10) : null;
    const cleanEmail = userEmail ? String(userEmail).toLowerCase().trim() : null;

    if (!prop && (cleanPhone || cleanEmail)) {
      const conditions = [];
      const params = [];
      if (cleanPhone) {
        conditions.push("s.phone LIKE ?");
        params.push(`%${cleanPhone}%`);
      }
      if (cleanEmail) {
        conditions.push("s.email = ?");
        params.push(cleanEmail);
      }
      if (conditions.length > 0) {
        const [rows] = await db.query(
          `SELECT p.*,
                  e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                  e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
           FROM my_properties p
           LEFT JOIN users e ON p.assigned_to = e.id
           LEFT JOIN sellers s ON p.seller_id = s.id
           WHERE ${conditions.join(" OR ")}
           ORDER BY p.id DESC LIMIT 1`,
          params
        );
        if (rows && rows.length > 0) prop = rows[0];
      }
    }

    // 4. Lookup by society name if provided
    if (!prop && societyName && String(societyName).trim().length > 2) {
      const cleanSoc = String(societyName).trim();
      const [rows] = await db.query(
        `SELECT p.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM my_properties p
         LEFT JOIN users e ON p.assigned_to = e.id
         WHERE p.society_name LIKE ?
         ORDER BY p.id DESC LIMIT 1`,
        [`%${cleanSoc}%`]
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    return prop;
  } catch (err) {
    console.error("resolveSellerPropertyAndExecutive error:", err);
    return null;
  }
}

/**
 * Helper to resolve owner rental property and assigned executive
 */
async function resolveOwnerPropertyAndExecutive({ userId, userPhone, userEmail, propertyId, societyName }) {
  try {
    let prop = null;
    const cleanPhone = userPhone ? String(userPhone).replace(/\D/g, "").slice(-10) : null;
    const cleanEmail = userEmail ? String(userEmail).toLowerCase().trim() : null;

    if (propertyId) {
      const [rows] = await db.query(
        `SELECT rp.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM rental_properties rp
         LEFT JOIN users e ON rp.assigned_to = e.id
         WHERE rp.id = ? LIMIT 1`,
        [propertyId]
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    if (!prop && userId) {
      const [rows] = await db.query(
        `SELECT rp.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM rental_properties rp
         LEFT JOIN users e ON rp.assigned_to = e.id
         LEFT JOIN owners o ON rp.owner_id = o.id
         LEFT JOIN users u ON u.id = ?
         WHERE rp.created_by = ? 
            OR rp.owner_id = ? 
            OR (u.email IS NOT NULL AND o.email = u.email) 
            OR (u.phone IS NOT NULL AND o.phone = u.phone)
         ORDER BY rp.id DESC LIMIT 1`,
        [userId, userId, userId]
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    if (!prop && (cleanPhone || cleanEmail)) {
      const conditions = [];
      const params = [];
      if (cleanPhone) {
        conditions.push("o.phone LIKE ? OR rp.owner_phone LIKE ?");
        params.push(`%${cleanPhone}%`, `%${cleanPhone}%`);
      }
      if (cleanEmail) {
        conditions.push("o.email = ? OR rp.owner_email = ?");
        params.push(cleanEmail, cleanEmail);
      }
      const [rows] = await db.query(
        `SELECT rp.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM rental_properties rp
         LEFT JOIN users e ON rp.assigned_to = e.id
         LEFT JOIN owners o ON rp.owner_id = o.id
         WHERE ${conditions.join(" OR ")}
         ORDER BY rp.id DESC LIMIT 1`,
        params
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    if (!prop && societyName && String(societyName).trim().length > 2) {
      const cleanSoc = String(societyName).trim();
      const [rows] = await db.query(
        `SELECT rp.*,
                e.salutation AS exec_salutation, e.first_name AS exec_first_name, e.last_name AS exec_last_name,
                e.phone AS exec_phone, e.email AS exec_email, e.role AS exec_role
         FROM rental_properties rp
         LEFT JOIN users e ON rp.assigned_to = e.id
         WHERE rp.society_name LIKE ?
         ORDER BY rp.id DESC LIMIT 1`,
        [`%${cleanSoc}%`]
      );
      if (rows && rows.length > 0) prop = rows[0];
    }

    return prop;
  } catch (err) {
    console.error("resolveOwnerPropertyAndExecutive error:", err);
    return null;
  }
}

/**
 * 3-Tier Intelligent Cascading Dynamic Executive Assignment
 * Tier 1: Existing Parent Entity Parity (Seller / Owner existing assigned_to, strictly non-admin)


const PUNE_LOCALITY_COORDS = [
  { name: "Wakad", lat: 18.5987, lng: 73.7661 },
  { name: "Tathawade", lat: 18.6186, lng: 73.7507 },
  { name: "Hinjewadi", lat: 18.5913, lng: 73.7389 },
  { name: "Marunji", lat: 18.6081, lng: 73.7228 },
  { name: "Punawale", lat: 18.6322, lng: 73.7438 },
  { name: "Rahatani", lat: 18.6015, lng: 73.7915 },
  { name: "Pimple Saudagar", lat: 18.5987, lng: 73.8000 },
  { name: "Pimple Nilakh", lat: 18.5772, lng: 73.7932 },
  { name: "Baner", lat: 18.5590, lng: 73.7868 },
  { name: "Balewadi", lat: 18.5750, lng: 73.7700 },
  { name: "Mahalunge", lat: 18.5714, lng: 73.7483 },
  { name: "Pimpri", lat: 18.6279, lng: 73.8009 },
  { name: "Chinchwad", lat: 18.6448, lng: 73.7997 },
  { name: "Ravet", lat: 18.6475, lng: 73.7408 },
  { name: "Koregaon Park", lat: 18.5362, lng: 73.8940 },
  { name: "Kothrud", lat: 18.5074, lng: 73.8077 },
  { name: "Kharadi", lat: 18.5516, lng: 73.9349 },
  { name: "Hadapsar", lat: 18.5089, lng: 73.9260 },
  { name: "Viman Nagar", lat: 18.5679, lng: 73.9143 },
  { name: "Katraj", lat: 18.4575, lng: 73.8677 },
];

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestLocalities(userLat, userLng, limit = 3) {
  if (!userLat || !userLng) return ["Wakad", "Tathawade", "Hinjewadi"];
  const sorted = [...PUNE_LOCALITY_COORDS]
    .map((loc) => ({
      ...loc,
      distance: getDistanceKm(userLat, userLng, loc.lat, loc.lng),
    }))
    .sort((a, b) => a.distance - b.distance);
  return sorted.slice(0, limit).map((l) => l.name);
}

function getNearbyLocations(locName) {
  const nearbyMap = {
    wakad: ["Tathawade", "Hinjewadi", "Punawale", "Rahatani"],
    tathawade: ["Wakad", "Punawale", "Ravet", "Hinjewadi"],
    hinjewadi: ["Marunji", "Wakad", "Tathawade", "Baner", "Punawale"],
    marunji: ["Hinjewadi", "Wakad", "Punawale", "Tathawade"],
    baner: ["Balewadi", "Wakad", "Hinjewadi", "Pashan"],
    balewadi: ["Baner", "Wakad", "Mahalunge", "Hinjewadi"],
    mahalunge: ["Balewadi", "Baner", "Hinjewadi", "Wakad"],
    punawale: ["Tathawade", "Marunji", "Wakad", "Ravet", "Rahatani"],
    rahatani: ["Pimple Saudagar", "Wakad", "Kalewadi", "Pimpri"],
    "pimple saudagar": ["Rahatani", "Wakad", "Pimple Nilakh", "Pimple Gurav"],
    "pimple nilakh": ["Baner", "Wakad", "Pimple Saudagar", "Aundh"],
    pimpri: ["Chinchwad", "Rahatani", "Bhosari", "Akurdi"],
    chinchwad: ["Pimpri", "Akurdi", "Nigdi", "Ravet"],
    ravet: ["Punawale", "Tathawade", "Kiwale", "Nigdi"],
  };
  const key = String(locName || "").toLowerCase().trim();
  if (nearbyMap[key]) {
    return nearbyMap[key];
  }
  return ["Wakad", "Tathawade", "Hinjewadi", "Rahatani"].filter((l) => l.toLowerCase() !== key);
}

/**
 * POST /api/rex/chat
 * Send a message to REX AI Agent, extract filters, and fetch 5 matching properties
 */
exports.handleChatMessage = async (req, res) => {
  try {
    const { message, session_uuid, guest_uuid, latitude, longitude, persona, requirements } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message text cannot be empty",
      });
    }

    const trimmedMsg = message.trim();
    if (trimmedMsg.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message exceeds maximum allowed length of 2000 characters",
      });
    }

    const userId = req.userId || null;
    const authenticatedUser = req.user || null;
    const finalGuestUuid = guest_uuid || req.headers["x-guest-uuid"] || null;

    // 1. Resolve or Create Session State
    const session = await RexSessionModel.findOrCreateSession({
      sessionUuid: session_uuid,
      userId,
      guestUuid: finalGuestUuid,
    });

    const history = Array.isArray(session.message_history) ? session.message_history : [];

    // Merge explicitly provided persona/requirements into current session state
    const currentProfile = { ...(session.extracted_profile || {}) };
    if (persona && typeof persona === "string") {
      currentProfile.role = persona;
    }

    const currentRequirements = { ...(session.extracted_requirements || {}) };
    if (requirements && typeof requirements === "object") {
      if (Array.isArray(requirements.locations) && requirements.locations.length > 0) {
        currentRequirements.locations = requirements.locations;
      }
      if (requirements.unit_type) {
        currentRequirements.unit_type = requirements.unit_type;
        const m = String(requirements.unit_type).match(/(\d+(?:\.\d+)?)/);
        if (m) currentRequirements.bedrooms = parseFloat(m[1]);
      }
      if (requirements.budget) {
        currentRequirements.budget = requirements.budget;
      }
    }

    // Special fast-path: Listing Status & Assigned Executive for Seller
    const lower = trimmedMsg.toLowerCase();
    const isStatusQuery = lower === "check listing status" || lower.includes("check listing status") || (lower.includes("listing status") && !lower.includes("under review"));
    const isExecQuery = lower === "talk to property executive" || lower.includes("talk to property executive") || lower.includes("talk to executive") || lower.includes("connect with executive") || lower.includes("chat with executive");

    const effectivePersona = persona || req.body?.persona || session.current_intent || currentProfile?.role;
    const isTenant = effectivePersona === "tenant" || session.current_intent === "tenant" || currentProfile?.role === "tenant";

    if (isTenant && isExecQuery) {
      const replyText = `You are connected with our Dedicated Rental Assistance Desk:\n\n• Dedicated Rental Desk: Tenant Support Team\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Our rental team assists you with owner contact details, physical flat verification, rental agreement drafting, and move-in coordination.\n\nYou can chat, call, or reach us on WhatsApp directly!`;

      const updatedHistory = [
        ...history,
        { id: `user_${Date.now()}`, sender: "user", text: trimmedMsg, timestamp: new Date().toISOString() },
        { id: `bot_${Date.now() + 1}`, sender: "bot", text: replyText, suggestions: ["Rent in Baner", "Rent in Wakad", "Rent in Hinjewadi", "Modify Filters"], timestamp: new Date().toISOString() },
      ];
      await RexSessionModel.updateSession(session.session_uuid, { messageHistory: updatedHistory.slice(-60) }).catch(() => {});

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        reply: replyText,
        suggestions: ["Rent in Baner", "Rent in Wakad", "Rent in Hinjewadi", "Modify Filters"],
        properties: [],
        pagination: { total: 0, limit: 5, offset: 0, hasMore: false, remaining: 0 },
      });
    }

    if (isStatusQuery || isExecQuery) {
      const prop = await resolveSellerPropertyAndExecutive({
        userId,
        userPhone: authenticatedUser?.phone || session.extracted_profile?.phone || null,
        userEmail: authenticatedUser?.email || session.extracted_profile?.email || null,
        societyName: currentRequirements?.society_name || null,
      });

      if (isStatusQuery) {
        const society = prop?.society_name || prop?.title || currentRequirements?.society_name || "Your Property";
        const loc = prop?.location_name || prop?.city_name || currentRequirements?.locations?.[0] || "Pune";
        const isPublic = prop ? Boolean(prop.is_public == 1 || prop.is_public === true) : false;
        const hasExecutive = Boolean(prop && prop.assigned_to && prop.exec_first_name);
        const execName = hasExecutive ? `${prop.exec_salutation ? prop.exec_salutation + " " : ""}${prop.exec_first_name} ${prop.exec_last_name || ""}`.trim() : null;
        const statusLabel = isPublic ? "Live & Public (Active Listing)" : (prop?.status === "Available" ? "Available" : "Under Review");
        const execLabel = hasExecutive ? `Assigned to ${execName}` : "Executive Assignment in Progress";
        const stageLabel = isPublic ? "Active Listing • Verified Buyer Matching" : "Document & Society Verification";

        const replyText = `Property Listing Status:\n\n• Property: ${society} (${loc})\n• Status: ${statusLabel}\n• Executive: ${execLabel}\n• Stage: ${stageLabel}\n\n${isPublic 
          ? `Your property is now public and actively visible to verified buyers on Resale Expert. Your assigned executive ${hasExecutive ? execName : "team"} is handling buyer inquiries, verified visits, and paperwork.` 
          : "Our operations team is currently reviewing your property details. A dedicated Property Executive will contact you shortly to verify ownership documents and initiate buyer matching."}`;

        const updatedHistory = [
          ...history,
          { id: `user_${Date.now()}`, sender: "user", text: trimmedMsg, timestamp: new Date().toISOString() },
          { id: `bot_${Date.now() + 1}`, sender: "bot", text: replyText, suggestions: ["Talk to Property Executive", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"], timestamp: new Date().toISOString() },
        ];
        await RexSessionModel.updateSession(session.session_uuid, { messageHistory: updatedHistory.slice(-60) }).catch(() => {});

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Talk to Property Executive", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"],
          properties: [],
          pagination: { total: 0, limit: 5, offset: 0, hasMore: false, remaining: 0 },
        });
      }

      if (isExecQuery && prop && prop.assigned_to && prop.exec_first_name) {
        const execName = `${prop.exec_salutation ? prop.exec_salutation + " " : ""}${prop.exec_first_name} ${prop.exec_last_name || ""}`.trim();
        const execPhone = prop.exec_phone || "+91 9637 00 9639";
        const execEmail = prop.exec_email || "support@resaleexpert.in";
        const society = prop.society_name || prop.title || "your property";

        let conversationId = null;
        if (userId && prop.id) {
          try {
            const [convRows] = await db.query(
              "SELECT id FROM property_conversations WHERE property_id = ? AND user_id = ? LIMIT 1",
              [prop.id, userId]
            );
            if (convRows && convRows.length > 0) {
              conversationId = convRows[0].id;
              await db.query("UPDATE property_conversations SET executive_id = ? WHERE id = ?", [prop.assigned_to, conversationId]).catch(() => {});
            } else {
              const newConv = await ChatModel.createOrGetAtomic({
                userId,
                propertyId: prop.id,
                executiveId: prop.assigned_to,
                initialMessage: `Hello! I would like to talk with my assigned Property Executive for ${society}.`,
                senderType: "user",
              });
              conversationId = newConv?.conversation?.id || null;
            }
          } catch (cErr) {
            console.warn("Executive conv sync notice:", cErr.message);
          }
        }

        const replyText = `You are connected with your dedicated Property Executive for ${society}:\n\n• Assigned Executive: ${execName}\n• Direct Phone / WhatsApp: ${execPhone}\n• Email: ${execEmail}\n• Role: Dedicated Property Executive (Physical verification, buyer visits, key holding & closing)\n\nYou can chat directly with ${prop.exec_first_name}, call, or message on WhatsApp:`;

        const updatedHistory = [
          ...history,
          { id: `user_${Date.now()}`, sender: "user", text: trimmedMsg, timestamp: new Date().toISOString() },
          { id: `bot_${Date.now() + 1}`, sender: "bot", text: replyText, suggestions: ["Check Listing Status", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"], timestamp: new Date().toISOString() },
        ];
        await RexSessionModel.updateSession(session.session_uuid, { messageHistory: updatedHistory.slice(-60) }).catch(() => {});

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Check Listing Status", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"],
          executive_card: {
            executiveName: execName,
            executiveFirstName: prop.exec_first_name,
            executivePhone: execPhone,
            executiveEmail: execEmail,
            executiveRole: prop.exec_role || "Dedicated Property Executive",
            propertyTitle: society,
            propertyId: prop.id,
            propertySlug: prop.slug || `${prop.id}`,
            propertyPrice: prop.budget || prop.final_price || 0,
            conversationId,
          },
          properties: [],
          pagination: { total: 0, limit: 5, offset: 0, hasMore: false, remaining: 0 },
        });
      }
    }

    // 2. Process message through REX AI Engine
    const aiResult = await rexAiService.processUserMessage({
      userMessage: trimmedMsg,
      conversationHistory: history,
      currentProfile,
      currentRequirements,
      authenticatedUser,
    });

    // 3. Perform 5-Card Paginated Search if criteria detected
    let foundProperties = [];
    let paginationInfo = { total: 0, limit: 5, offset: 0, hasMore: false, remaining: 0 };
    const lowerTrimmed = trimmedMsg.toLowerCase();
    const isKnowledgeQuery =
      rexAiService.isRealEstateKnowledgeQuery(trimmedMsg) ||
      lowerTrimmed.includes("market rent") ||
      lowerTrimmed.includes("market rate") ||
      lowerTrimmed.includes("market price") ||
      lowerTrimmed.includes("current rent") ||
      lowerTrimmed.includes("current rate") ||
      lowerTrimmed.includes("current market") ||
      lowerTrimmed.includes("average rent") ||
      lowerTrimmed.includes("average rate") ||
      lowerTrimmed.includes("average price") ||
      lowerTrimmed.includes("what is the rent") ||
      lowerTrimmed.includes("what is the rate") ||
      lowerTrimmed.includes("what is the price") ||
      lowerTrimmed.includes("what is rent") ||
      lowerTrimmed.includes("how much is rent") ||
      lowerTrimmed.includes("how much rent") ||
      lowerTrimmed.includes("rental yield") ||
      lowerTrimmed.includes("stamp duty") ||
      lowerTrimmed.includes("registration charge") ||
      lowerTrimmed.includes("registration fee") ||
      lowerTrimmed.includes("agreement rules") ||
      lowerTrimmed.includes("rental agreement") ||
      lowerTrimmed.includes("rules");

    const isDashboardQuery =
      lowerTrimmed === "open your dashboard" ||
      lowerTrimmed === "open dashboard" ||
      lowerTrimmed === "my dashboard" ||
      lowerTrimmed === "dashboard" ||
      lowerTrimmed.includes("dashboard");

    const isActionOrNav =
      isDashboardQuery ||
      lowerTrimmed.includes("talk to") ||
      lowerTrimmed.includes("connect with") ||
      lowerTrimmed.includes("interested tenant") ||
      lowerTrimmed.includes("tenant demand") ||
      lowerTrimmed.includes("check interested");

    if (isDashboardQuery) {
      if (persona === "owner" || currentProfile.role === "owner" || lowerTrimmed.includes("owner")) {
        aiResult.reply = "You can access your Owner Portal to review verified tenant inquiries, move-in timelines, and track your active rental listings directly in your dashboard.";
        aiResult.suggestions = ["List Another Rental Property", "Check Interested Tenants", "Talk to Sales Executive", "Rental Agreement Rules"];
        aiResult.intent = "owner";
      } else if (persona === "seller" || currentProfile.role === "seller" || lowerTrimmed.includes("seller")) {
        aiResult.reply = "You can access your Seller Dashboard to check active buyer leads in your society, scheduled executive inspections, and review your property listing status.";
        aiResult.suggestions = ["Check Active Buyers in My Locality", "Get Free Property Valuation", "Talk to Property Executive"];
        aiResult.intent = "seller";
      } else if (persona === "tenant" || currentProfile.role === "tenant" || lowerTrimmed.includes("tenant")) {
        aiResult.reply = "You can access your Tenant Dashboard to manage your shortlisted rental properties, scheduled visits, and connect with your rental executive.";
        aiResult.suggestions = ["Rent in Baner", "Rent in Wakad", "Explore Rental Listings", "Talk to Executive"];
        aiResult.intent = "tenant";
      } else {
        aiResult.reply = "You can open your Dashboard to check your saved properties, scheduled visits, and executive communications.";
        aiResult.suggestions = ["Explore 2 BHK in Pune", "Book Site Visit", "Talk to Executive"];
      }
    }

    if (aiResult.should_search_properties && !isKnowledgeQuery && !isActionOrNav) {
      try {
        const reqs = aiResult.extracted_requirements || {};
        const searchFilters = {
          city: reqs.city || "Pune",
          locations: reqs.locations || [],
          propertyType: reqs.property_type || null,
          propertySubtype: reqs.property_subtype || null,
          unitType: reqs.unit_type || null,
          bedrooms: reqs.bedrooms || null,
          budgetMin: reqs.budget_min || null,
          budgetMax: reqs.budget_max || null,
        };

        const isNearbyRequest =
          trimmedMsg.toLowerCase().includes("nearby") ||
          trimmedMsg.toLowerCase().includes("near me") ||
          trimmedMsg.toLowerCase().includes("explore nearby") ||
          trimmedMsg.toLowerCase().includes("surrounding");

        const isShowAllRequest =
          trimmedMsg.toLowerCase().includes("show all") ||
          trimmedMsg.toLowerCase().includes("all properties") ||
          trimmedMsg.toLowerCase().includes("browse all");

        if (isNearbyRequest) {
          const baseLoc = searchFilters.locations?.[0] || session.extracted_requirements?.locations?.[0] || "Wakad";
          const nearbyLocs = getNearbyLocations(baseLoc);
          searchFilters.locations = nearbyLocs.slice(0, 3);
          searchFilters.budgetMax = null;
          searchFilters.budgetMin = null;
          searchFilters.bedrooms = null;
          searchFilters.unitType = null;
        } else if (isShowAllRequest) {
          searchFilters.budgetMax = null;
          searchFilters.budgetMin = null;
          searchFilters.bedrooms = null;
          searchFilters.unitType = null;
        }

        const hasSpecificLocation = Array.isArray(searchFilters.locations) && searchFilters.locations.length > 0;
        const locName = hasSpecificLocation ? searchFilters.locations[0] : "";

        const isTenantSearch =
          persona === "tenant" ||
          currentProfile.role === "tenant" ||
          aiResult.intent === "tenant" ||
          aiResult.extracted_requirements?.transaction_type === "rent" ||
          trimmedMsg.toLowerCase().includes("rent") ||
          trimmedMsg.toLowerCase().includes("tenant");

        if (isTenantSearch) {
          // 1. Search rental_properties table
          let searchRes = await searchRentalPropertiesPaginated(searchFilters, 5, 0);

          // 2. If 0 matches in requested location
          if (!searchRes.properties || searchRes.properties.length === 0) {
            const unitTypeName = searchFilters.unitType || (searchFilters.bedrooms ? `${searchFilters.bedrooms} BHK` : "");
            const budgetStr = searchFilters.budgetMax ? ` within ₹${Number(searchFilters.budgetMax).toLocaleString("en-IN")}/mo` : "";

            const [availLocRows] = await db.query(
              `SELECT DISTINCT location_name FROM rental_properties WHERE is_public = 1 AND (status = 'Available' OR status IS NULL OR status = '') AND location_name IS NOT NULL AND location_name != '' LIMIT 3`
            );
            const otherLocs = (availLocRows || []).map((r) => r.location_name).filter((l) => l.toLowerCase() !== locName.toLowerCase());

            if (locName) {
              if (otherLocs.length > 0) {
                aiResult.reply = `Currently, no rental properties are available in ${locName}${unitTypeName ? ` for ${unitTypeName}` : ""}${budgetStr}. However, we have verified rental listings available in ${otherLocs.join(" and ")}. Would you like to explore those?`;
                aiResult.suggestions = [
                  `Show rentals in ${otherLocs[0]}`,
                  ...(otherLocs[1] ? [`Show rentals in ${otherLocs[1]}`] : []),
                  "Explore nearby rentals",
                  "Modify rent budget",
                  "Talk to Executive",
                ];
              } else {
                aiResult.reply = `Currently, no rental properties are available in ${locName}${unitTypeName ? ` for ${unitTypeName}` : ""}${budgetStr}. Would you like to check nearby locations or talk to an executive?`;
                aiResult.suggestions = ["Explore nearby rentals", "Modify rent budget", "Talk to Executive"];
              }
            } else {
              aiResult.reply = `Currently, no rental properties match your exact criteria. Would you like to adjust your budget or explore other rental locations in Pune?`;
              aiResult.suggestions = ["Show all Pune rentals", "Rent in Baner", "Rent in Hinjewadi", "Modify rent budget"];
            }

            searchRes.properties = [];
            searchRes.total = 0;
            searchRes.hasMore = false;
          }

          foundProperties = (searchRes.properties || []).map(sanitizeRentalPropertyForChat);
          paginationInfo = {
            total: searchRes.total || foundProperties.length,
            limit: searchRes.limit || 5,
            offset: searchRes.offset || 0,
            hasMore: searchRes.hasMore || false,
            remaining: searchRes.remaining || 0,
          };

          if (foundProperties.length > 0) {
            const unitDesc = searchFilters.unitType ? `${searchFilters.unitType} ` : "";
            const budgetDesc = searchFilters.budgetMax ? ` under ₹${Number(searchFilters.budgetMax).toLocaleString("en-IN")}/mo` : "";
            aiResult.reply = `Here are verified rental properties available in ${locName || "Pune"}${budgetDesc}:`;
            aiResult.suggestions = ["Contact Owner", "Explore nearby rentals", "Rent in Baner", "Modify Filters"];
          }
        } else {
          // 1. Search with exact filters (Sale properties)
          let searchRes = await Property.searchPublicPropertiesPaginated(searchFilters, 5, 0);

          // 2. If 0 exact matches in location due to strict budget/BHK, check available inventory in that location
          if (!searchRes.properties || searchRes.properties.length === 0) {
            const unitTypeName = searchFilters.unitType || (searchFilters.bedrooms ? `${searchFilters.bedrooms} BHK` : "");
            const budgetStr = reqs.budget || (searchFilters.budgetMax ? formatPrice(searchFilters.budgetMax) : "");

            if (hasSpecificLocation) {
              const locInventory = await Property.searchPublicPropertiesPaginated(
                { city: searchFilters.city, locations: searchFilters.locations },
                5,
                0
              );

              if (locInventory.properties && locInventory.properties.length > 0) {
                const availableBHKs = [...new Set(locInventory.properties.map((p) => p.unit_type).filter(Boolean))];
                const validPrices = locInventory.properties
                  .map((p) => Number(p.final_price || p.budget || p.price || 0))
                  .filter((p) => p > 0);
                const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
                const formattedMin = minPrice ? formatPrice(minPrice) : "";
                const bhkList = availableBHKs.length > 0 ? availableBHKs.slice(0, 2).join(" & ") : "Other";
                const priceText = formattedMin ? ` starting from ${formattedMin}` : "";

                searchRes = locInventory;
                aiResult.reply = `Currently, exact ${unitTypeName ? `${unitTypeName} ` : ""}options are not available in ${locName}${budgetStr ? ` within ${budgetStr}` : ""}. However, here are verified ${bhkList} properties available in ${locName}${priceText}:`;
                aiResult.suggestions = [
                  ...(availableBHKs.length > 0 ? [`Show ${availableBHKs[0]} in ${locName}`] : []),
                  "Explore nearby areas",
                  "Modify Filters",
                  "Connect with Executive",
                ];
              } else {
                // 3. If no listings in that exact location at all, search nearby localities
                const nearbyLocs = getNearbyLocations(locName);
                const nearbyRes = await Property.searchPublicPropertiesPaginated(
                  { city: searchFilters.city, locations: nearbyLocs.slice(0, 3) },
                  5,
                  0
                );
                if (nearbyRes.properties && nearbyRes.properties.length > 0) {
                  searchRes = nearbyRes;
                  aiResult.reply = `Currently, no properties are directly available in ${locName}. Here are verified properties in nearby locations like ${nearbyLocs.slice(0, 2).join(" & ")}:`;
                  aiResult.suggestions = [
                    `Show all in ${nearbyLocs[0]}`,
                    nearbyLocs[1] ? `Show all in ${nearbyLocs[1]}` : "Explore nearby areas",
                    "Explore nearby areas",
                    "Modify Filters",
                  ];
                } else {
                  aiResult.reply = `Currently, no properties are available in ${locName} matching your criteria. Would you like to explore other popular locations in Pune or modify your budget?`;
                  aiResult.suggestions = [
                    "Explore nearby areas",
                    "Show all Pune properties",
                    "Modify Filters",
                    "Connect with Executive",
                  ];
                  searchRes.properties = [];
                  searchRes.total = 0;
                  searchRes.hasMore = false;
                }
              }
            } else {
              const anyRes = await Property.searchPublicPropertiesPaginated(
                { city: searchFilters.city },
                5,
                0
              );
              if (anyRes.properties && anyRes.properties.length > 0) {
                searchRes = anyRes;
                aiResult.reply = `Here are featured verified properties available in Pune:`;
                aiResult.suggestions = [
                  "Show all Pune properties",
                  "2 BHK in Wakad",
                  "Properties in Hinjewadi",
                  "Modify Filters",
                ];
              } else {
                aiResult.reply = `Currently, no properties match your exact criteria. Would you like to adjust your budget or explore other areas in Pune?`;
                aiResult.suggestions = [
                  "Show all Pune properties",
                  "2 BHK in Wakad",
                  "Properties in Hinjewadi",
                  "Modify Filters",
                ];
                searchRes.properties = [];
                searchRes.total = 0;
                searchRes.hasMore = false;
              }
            }
          }

          foundProperties = (searchRes.properties || []).map(sanitizePropertyForChat);
          paginationInfo = {
            total: searchRes.total || foundProperties.length,
            limit: searchRes.limit || 5,
            offset: searchRes.offset || 0,
            hasMore: searchRes.hasMore || false,
            remaining: searchRes.remaining || 0,
          };

          if (foundProperties.length > 0) {
            const unitDesc = searchFilters.unitType ? `${searchFilters.unitType} ` : "";
            const budgetDesc = searchFilters.budgetMax ? ` under ${formatPrice(searchFilters.budgetMax)}` : "";
            if (!aiResult.reply || aiResult.reply.includes("hold on") || aiResult.reply.includes("gather") || aiResult.reply.includes("wait") || aiResult.reply.includes("search for available") || aiResult.reply.includes("I will search")) {
              aiResult.reply = `Here are available ${unitDesc}properties in ${locName || "Pune"}${budgetDesc}:`;
            }
            aiResult.suggestions = [
              "Book Site Visit",
              "Talk to Property Executive",
              "Explore nearby areas",
              "Modify Filters",
            ];
          }
        }
      } catch (searchErr) {
        console.error("Property search in REX controller error:", searchErr);
      }
    }

    // 4. Append messages to session history
    const now = new Date().toISOString();
    const botHistoryItem = {
      id: `r_${Date.now() + 1}`,
      sender: "rex",
      text: aiResult.reply,
      suggestions: aiResult.suggestions,
      properties: foundProperties.length > 0 ? foundProperties : undefined,
      pagination: foundProperties.length > 0 ? paginationInfo : undefined,
      timestamp: now,
    };

    const updatedHistory = [
      ...history,
      { id: `u_${Date.now()}`, sender: "user", text: trimmedMsg, timestamp: now },
      botHistoryItem,
    ];

    const cappedHistory = updatedHistory.slice(-50);

    // 5. Update session in database
    await RexSessionModel.updateSession(session.session_uuid, {
      currentIntent: aiResult.intent,
      extractedProfile: aiResult.extracted_profile,
      extractedRequirements: aiResult.extracted_requirements,
      messageHistory: cappedHistory,
      isQualified: aiResult.is_qualified,
      leadId: session.lead_id || null,
    });

    return res.status(200).json({
      success: true,
      reply: aiResult.reply,
      suggestions: aiResult.suggestions,
      properties: foundProperties,
      pagination: paginationInfo,
      session_uuid: session.session_uuid,
      intent: aiResult.intent,
      show_buyer_filter: Boolean(aiResult.show_buyer_filter && !isKnowledgeQuery),
      show_tenant_filter: Boolean(aiResult.show_tenant_filter && !isKnowledgeQuery),
      show_owner_wizard: Boolean(aiResult.show_owner_wizard && (userId || authenticatedUser)),
      show_owner_registration: Boolean(aiResult.show_owner_wizard && !userId && !authenticatedUser),
      show_seller_wizard: Boolean(aiResult.show_seller_wizard),
      profile: aiResult.extracted_profile,
      requirements: aiResult.extracted_requirements,
      is_qualified: aiResult.is_qualified,
    });
  } catch (error) {
    console.error("Error in handleChatMessage:", error);
    return res.status(500).json({
      success: false,
      message: "REX AI assistant is currently unable to process your request. Please try again.",
    });
  }
};

/**
 * POST /api/rex/action
 * Handle structured interactive clicks (start_onboarding, set_role, load_more, interested, etc.)
 */
exports.handleAction = async (req, res) => {
  try {
    const { action, payload, session_uuid, guest_uuid } = req.body;
    const userId = req.userId || payload?.user_id || req.body?.user_id || null;
    const finalGuestUuid = guest_uuid || req.headers["x-guest-uuid"] || null;

    const session = await RexSessionModel.findOrCreateSession({
      sessionUuid: session_uuid,
      userId,
      guestUuid: finalGuestUuid,
    });

    const currentProfile = session.extracted_profile || {};
    const currentReqs = session.extracted_requirements || {};

    if (action === "load_more") {
      const offset = Number(payload?.offset) || 5;
      const isTenant = currentProfile.role === "tenant" || currentReqs.transaction_type === "rent";
      if (isTenant) {
        const searchFilters = {
          city: currentReqs.city || null,
          locations: currentReqs.locations || [],
          propertyType: currentReqs.property_type || null,
          propertySubtype: currentReqs.property_subtype || null,
          unitType: currentReqs.unit_type || null,
          bedrooms: currentReqs.bedrooms || null,
          budgetMin: currentReqs.budget_min || null,
          budgetMax: currentReqs.budget_max || null,
        };
        const result = await searchRentalPropertiesPaginated(searchFilters, 5, offset);
        const properties = (result.properties || []).map(sanitizeRentalPropertyForChat);
        return res.status(200).json({
          success: true,
          properties,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            hasMore: result.hasMore,
            remaining: result.remaining,
          },
        });
      }

      const searchFilters = {
        city: currentReqs.city || null,
        locations: currentReqs.locations || [],
        propertyType: currentReqs.property_type || null,
        propertySubtype: currentReqs.property_subtype || null,
        unitType: currentReqs.unit_type || null,
        bedrooms: currentReqs.bedrooms || null,
        budgetMin: currentReqs.budget_min || null,
        budgetMax: currentReqs.budget_max || null,
      };

      const result = await Property.searchPublicPropertiesPaginated(searchFilters, 5, offset);
      const properties = (result.properties || []).map(sanitizePropertyForChat);

      return res.status(200).json({
        success: true,
        properties,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
          remaining: result.remaining,
        },
      });
    }

    if (action === "set_role") {
      const role = String(payload?.role || "buyer").toLowerCase();
      currentProfile.role = role;
      await RexSessionModel.updateSession(session.session_uuid, {
        extractedProfile: currentProfile,
      });

      let reply = "";
      let suggestions = [];

      if (role === "buyer") {
        reply = "Wonderful! Can you describe what type of property you are looking for, preferred location, and your price range?";
        suggestions = ["2 BHK in Wakad under 70L", "3 BHK Apartment in Baner", "Villa near Hinjewadi"];
      } else if (role === "tenant") {
        reply = "Great! I can help you find verified rental homes in Pune. Use the filters below or tell me your preferred locality, budget, and BHK.";
        suggestions = ["1 BHK in Hinjewadi", "2 BHK in Wakad", "Rental flats in Baner"];
      } else if (role === "seller" || role === "owner") {
        reply = "Great! What is your property type, society/location name, and expected selling price?";
        suggestions = ["Selling 2 BHK in Pimple Saudagar", "List 3 BHK in Wakad", "Talk to Sales Executive"];
      } else {
        reply = `Hello! How may I assist you with ${role} inquiries today? Please let me know your preferred property configuration and location.`;
        suggestions = ["Browse Available Properties", "Schedule a Visit", "Talk to Executive"];
      }

      return res.status(200).json({
        success: true,
        reply,
        suggestions,
        profile: currentProfile,
        show_tenant_filter: role === "tenant",
        show_buyer_filter: role === "buyer",
      });
    }

    if (action === "update_profile") {
      const profile = { ...currentProfile, ...(payload || {}) };
      await RexSessionModel.updateSession(session.session_uuid, {
        extractedProfile: profile,
        currentIntent: payload?.role || payload?.persona || session.current_intent || "buyer",
      });
      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        profile,
      });
    }

    if (action === "save_message") {
      const history = Array.isArray(session.message_history) ? [...session.message_history] : [];
      if (Array.isArray(payload?.messages)) {
        for (const m of payload.messages) {
          history.push({
            id: m.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            sender: m.sender || "user",
            text: m.text || "",
            suggestions: m.suggestions || undefined,
            properties: m.properties || undefined,
            visitScheduler: m.visitScheduler || undefined,
            visit: m.visit || m.confirmedVisit || undefined,
            inChatOtp: m.inChatOtp || undefined,
            sellerConfirmedCard: m.sellerConfirmedCard || undefined,
            sellerWizardCard: m.sellerWizardCard || undefined,
            buyerFilterCard: m.buyerFilterCard || undefined,
            sellerProperty: m.sellerProperty || payload?.sellerProperty || undefined,
            timestamp: m.timestamp || new Date().toISOString(),
          });
        }
      } else if (payload) {
        history.push({
          id: payload.id || `msg_${Date.now()}`,
          sender: payload.sender || "user",
          text: payload.text || "",
          suggestions: payload.suggestions || undefined,
          properties: payload.properties || undefined,
          visitScheduler: payload.visitScheduler || undefined,
          visit: payload.visit || payload.confirmedVisit || undefined,
          inChatOtp: payload.inChatOtp || undefined,
          sellerConfirmedCard: payload.sellerConfirmedCard || undefined,
          sellerWizardCard: payload.sellerWizardCard || undefined,
          buyerFilterCard: payload.buyerFilterCard || undefined,
          sellerProperty: payload.sellerProperty || undefined,
          timestamp: payload.timestamp || new Date().toISOString(),
        });
      }

      const updatedProfile = payload?.profile
        ? { ...(session.extracted_profile || {}), ...payload.profile }
        : session.extracted_profile;

      let updatedRequirements = session.extracted_requirements || {};
      if (payload?.sellerProperty) {
        const sp = payload.sellerProperty;
        const pNum = parseFloat(String(sp.expected_price || "").replace(/[^\d.]/g, ""));
        let parsedPrice = 0;
        if (!isNaN(pNum)) {
          const lowerStr = String(sp.expected_price).toLowerCase();
          if (lowerStr.includes("cr")) parsedPrice = pNum * 10000000;
          else if (lowerStr.includes("lakh") || lowerStr.includes("lac") || lowerStr.includes("l")) parsedPrice = pNum * 100000;
          else parsedPrice = pNum;
        }
        let parsedBhkNum = null;
        if (sp.bhk) {
          const m = String(sp.bhk).match(/\d+/);
          if (m) parsedBhkNum = parseInt(m[0], 10);
        }

        updatedRequirements = {
          ...updatedRequirements,
          society_name: sp.society_name || updatedRequirements.society_name,
          locations: sp.locality ? [sp.locality] : updatedRequirements.locations,
          unit_type: sp.bhk || updatedRequirements.unit_type,
          bedrooms: parsedBhkNum || updatedRequirements.bedrooms,
          budget_max: parsedPrice || updatedRequirements.budget_max,
          carpet_area: sp.carpet_area || updatedRequirements.carpet_area,
          furnishing: sp.furnishing || updatedRequirements.furnishing,
        };
      }

      await RexSessionModel.updateSession(session.session_uuid, {
        messageHistory: history.slice(-60),
        extractedProfile: updatedProfile,
        extractedRequirements: updatedRequirements,
        currentIntent: payload?.persona || payload?.role || session.current_intent || "buyer",
      });
      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        profile: updatedProfile,
      });
    }

    if (action === "interested") {
      const propertyId = payload?.property_id;
      let propertyData = null;
      if (propertyId) {
        const rawProp = await Property.getById(propertyId).catch(() => null);
        if (rawProp) propertyData = sanitizePropertyForChat(rawProp);
      }

      // If user is logged in, record lead
      let leadId = session.lead_id || null;
      if (userId && propertyId && !leadId) {
        try {
          const dynExec = await resolveDynamicExecutive({
            propertyId,
            location: propertyData?.location,
            society: propertyData?.society_name,
          });
          const assignedExecId = dynExec?.id || propertyData?.assigned_to || null;

          const lead = await Lead.create({
            name: req.user?.first_name ? `${req.user.first_name} ${req.user.last_name || ""}`.trim() : "Interested Buyer",
            phone: req.user?.phone || currentProfile.phone || "0000000000",
            email: req.user?.email || currentProfile.email || null,
            property_id: propertyId,
            lead_type: "buyer",
            lead_source: "REX AI Chatbot",
            status: "new",
            priority: "hot",
            assigned_executive: assignedExecId,
          }).catch(() => null);
          if (lead?.id) leadId = lead.id;
        } catch (e) {
          console.warn("Lead create notice:", e.message);
        }
      }

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        reply: `Excellent choice! Would you like to schedule a site visit for **${propertyData?.title || "this property"}**?`,
        suggestions: ["Today", "Tomorrow", "Select Custom Date"],
        property: propertyData,
        lead_id: leadId,
      });
    }

    if (action === "submit_seller_property") {
      const {
        society_name,
        locality,
        bhk,
        carpet_area,
        expected_price,
        furnishing,
        floor,
        notes,
        seller_name,
        seller_phone,
        seller_email,
      } = payload || {};

      let parsedBedrooms = null;
      if (bhk) {
        const match = String(bhk).match(/\d+/);
        if (match) parsedBedrooms = parseInt(match[0], 10);
      }

      let parsedPrice = 0;
      if (expected_price) {
        const pNum = parseFloat(String(expected_price).replace(/[^\d.]/g, ""));
        if (!isNaN(pNum)) {
          const lowerPriceStr = String(expected_price).toLowerCase();
          if (lowerPriceStr.includes("cr")) {
            parsedPrice = pNum * 10000000;
          } else if (lowerPriceStr.includes("lakh") || lowerPriceStr.includes("lac") || lowerPriceStr.includes("l")) {
            parsedPrice = pNum * 100000;
          } else {
            parsedPrice = pNum;
          }
        }
      }

      // 1. Resolve dynamic executive using 3-Tier Intelligent Cascading Strategy
      let assignedExec = await resolveDynamicExecutive({
        location: locality || payload?.location_name,
        society: society_name,
      });

      if (!assignedExec) {
        assignedExec = {
          id: null,
          first_name: "Sales",
          last_name: "Executive",
          phone: "+91 9637 00 9639",
          email: "support@resaleexpert.in",
          role: "sales executive",
        };
      }
      const execFullName = `${assignedExec.first_name} ${assignedExec.last_name || ""}`.trim();

      const effectiveName =
        seller_name ||
        (req.user?.first_name ? `${req.user.first_name} ${req.user.last_name || ""}`.trim() : null) ||
        currentProfile.first_name ||
        "Property Seller";

      const effectivePhone = seller_phone || req.user?.phone || currentProfile.phone || null;
      const effectiveEmail = seller_email || req.user?.email || currentProfile.email || null;

      let leadId = session.lead_id || null;
      let sellerEntityId = null;

      if (effectivePhone || effectiveEmail) {
        try {
          const lead = await Lead.create({
            name: effectiveName,
            phone: effectivePhone,
            email: effectiveEmail,
            lead_type: "seller",
            lead_source: "REX AI Chatbot",
            status: "new",
            priority: "hot",
            city: "Pune",
            location: locality || payload?.location_name || "Pune",
            assigned_to: assignedExec.id,
            assigned_to_name: execFullName,
          }).catch((err) => {
            console.warn("Notice: Lead create skipped duplicate or error:", err.message);
            return null;
          });
          if (lead?.id) leadId = lead.id;
        } catch (e) {
          console.warn("Seller lead creation notice:", e.message);
        }

        // Provision or link CRM Seller profile in `sellers` table
        try {
          const [existingSellers] = await db.query(
            "SELECT id FROM sellers WHERE (email = ? AND email IS NOT NULL AND email != '') OR (phone = ? AND phone IS NOT NULL AND phone != '') LIMIT 1",
            [effectiveEmail, effectivePhone]
          );
          if (existingSellers && existingSellers.length > 0) {
            sellerEntityId = existingSellers[0].id;
            await db.query(
              "UPDATE sellers SET status = 'uncontacted', stage = 'uncontacted', location = COALESCE(?, location), assigned_to = ?, assigned_to_name = ? WHERE id = ?",
              [locality || payload?.location_name || null, assignedExec.id, execFullName, sellerEntityId]
            );
          } else {
            const [sInsert] = await db.query(
              `INSERT INTO sellers (salutation, name, phone, email, source, status, stage, location, city, assigned_to, assigned_to_name, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'REX AI Chatbot', 'uncontacted', 'uncontacted', ?, 'Pune', ?, ?, NOW(), NOW())`,
              ['Mr.', effectiveName, effectivePhone, effectiveEmail, locality || payload?.location_name || null, assignedExec.id, execFullName]
            );
            sellerEntityId = sInsert.insertId;
          }
        } catch (sErr) {
          console.warn("Seller entity sync error:", sErr.message);
        }
      }

      // 1. Auto-sync Society & Locality into master_values & societies table if new / custom
      const cleanSocName = society_name ? String(society_name).trim() : "";
      const cleanLocName = (locality || payload?.location_name) ? String(locality || payload?.location_name).trim() : "";

      if (cleanSocName) {
        try {
          // Check & add to master_values
          const [socMasterType] = await db.query(
            "SELECT id FROM master_types WHERE tab_id = 'property' AND LOWER(name) = 'society' LIMIT 1"
          );
          if (socMasterType && socMasterType.length > 0) {
            const masterTypeId = socMasterType[0].id;
            const [existingVal] = await db.query(
              "SELECT id FROM master_values WHERE master_type_id = ? AND LOWER(TRIM(value)) = LOWER(?) LIMIT 1",
              [masterTypeId, cleanSocName]
            );
            if (!existingVal || existingVal.length === 0) {
              const { v4: uuidv4 } = require("uuid");
              await db.query(
                "INSERT INTO master_values (id, master_type_id, value, status) VALUES (?, ?, ?, 'Active')",
                [uuidv4(), masterTypeId, cleanSocName]
              );
            }
          }

          // Check & add to societies table if not exists
          const [existSoc] = await db.query(
            "SELECT id FROM societies WHERE LOWER(TRIM(society_name)) = LOWER(?) LIMIT 1",
            [cleanSocName]
          );
          if (!existSoc || existSoc.length === 0) {
            const SocietyModel = require("../models/SocietyModel");
            await SocietyModel.createSociety({
              societyName: cleanSocName,
              locality: cleanLocName || "Pune",
              city: "Pune",
              pincode: "411001",
              status: "Active",
            });
          }
        } catch (socErr) {
          console.warn("Auto-society sync notice:", socErr.message);
        }
      }

      if (cleanLocName) {
        try {
          const [locMasterType] = await db.query(
            "SELECT id FROM master_types WHERE tab_id = 'property' AND (LOWER(name) = 'location' OR LOWER(name) = 'locality') LIMIT 1"
          );
          if (locMasterType && locMasterType.length > 0) {
            const masterTypeId = locMasterType[0].id;
            const [existingLocVal] = await db.query(
              "SELECT id FROM master_values WHERE master_type_id = ? AND LOWER(TRIM(value)) = LOWER(?) LIMIT 1",
              [masterTypeId, cleanLocName]
            );
            if (!existingLocVal || existingLocVal.length === 0) {
              const { v4: uuidv4 } = require("uuid");
              await db.query(
                "INSERT INTO master_values (id, master_type_id, value, status) VALUES (?, ?, ?, 'Active')",
                [uuidv4(), masterTypeId, cleanLocName]
              );
            }
          }
        } catch (locErr) {
          console.warn("Auto-locality sync notice:", locErr.message);
        }
      }

      // Create new property in my_properties linked directly to sellerEntityId & assigned to assignedExec
      let createdPropertyId = null;
      try {
        const propInsertId = await Property.create({
          seller_name: effectiveName,
          seller_id: sellerEntityId || payload?.seller_id || (userId ? Number(userId) : null) || null,
          assigned_to: assignedExec.id,
          property_type_name: payload?.property_type_name || "Residential",
          property_subtype_name: payload?.property_subtype_name || "Apartment",
          unit_type: bhk || payload?.unit_type || (parsedBedrooms ? `${parsedBedrooms} BHK` : "Apartment"),
          bedrooms: parsedBedrooms,
          furnishing: null,
          city_name: "Pune",
          location_name: locality || payload?.location_name || null,
          society_name: society_name || null,
          floor: floor || null,
          carpet_area: carpet_area ? String(carpet_area) : null,
          budget: parsedPrice || null,
          final_price: parsedPrice || null,
          status: "Pending Review",
          lead_source: "REX AI Chatbot",
          is_public: 0,
          description: notes || `Submitted via REX AI Chatbot by ${effectiveName}. Assigned to dedicated Property Executive ${execFullName}.`,
        }).catch((err) => {
          console.error("Failed to insert seller property:", err);
          return null;
        });

        if (propInsertId) {
          createdPropertyId = propInsertId;
          const slug = `${propInsertId}-${(society_name || locality || payload?.location_name || "property").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          await Property.updateSlug(propInsertId, slug).catch(() => {});
        }
      } catch (pErr) {
        console.warn("Property creation notice:", pErr.message);
      }

      // 1. Append message history (merging any messages sent in payload)
      let history = Array.isArray(session.message_history) ? [...session.message_history] : [];
      if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
        for (const m of payload.messages) {
          if (!history.some((h) => h.id === m.id)) {
            history.push({
              id: m.id || `msg_${Date.now()}`,
              sender: m.sender || "user",
              text: m.text || "",
              suggestions: m.suggestions || undefined,
              properties: m.properties || undefined,
              sellerConfirmedCard: m.sellerConfirmedCard || undefined,
              sellerWizardCard: m.sellerWizardCard || undefined,
              buyerFilterCard: m.buyerFilterCard || undefined,
              timestamp: m.timestamp || new Date().toISOString(),
            });
          }
        }
      }

      await RexSessionModel.updateSession(session.session_uuid, {
        leadId: leadId || session.lead_id,
        currentIntent: "seller",
        isQualified: 1,
        messageHistory: history.slice(-60),
        extractedProfile: {
          ...currentProfile,
          role: "seller",
          name: effectiveName,
          first_name: effectiveName,
          phone: effectivePhone,
          email: effectiveEmail,
        },
        extractedRequirements: {
          ...currentReqs,
          locations: (locality || payload?.location_name) ? [locality || payload?.location_name] : currentReqs.locations,
          society_name: society_name || currentReqs.society_name,
          bedrooms: parsedBedrooms || currentReqs.bedrooms,
          unit_type: bhk || payload?.unit_type || (parsedBedrooms ? `${parsedBedrooms} BHK` : currentReqs.unit_type),
          budget_max: parsedPrice || currentReqs.budget_max,
          carpet_area: carpet_area || currentReqs.carpet_area,
          furnishing: null,
        },
      });

      // 2. Create or link Property Conversation in Human Desk for Executive & Seller
      let conversation = null;
      if (userId && createdPropertyId) {
        try {
          const convResult = await ChatModel.createOrGetAtomic({
            userId,
            propertyId: createdPropertyId,
            executiveId: assignedExec.id,
            leadId,
            initialMessage: `New Seller Listing: ${bhk || payload?.unit_type || "Apartment"} in ${society_name || "Society"}, ${locality || payload?.location_name || "Pune"} (Expected: ${expected_price || "₹" + Number(parsedPrice).toLocaleString("en-IN")}). Submitted for executive review.`,
            senderType: "user",
          });
          conversation = convResult.conversation;
        } catch (convErr) {
          console.warn("Seller property conversation atomic init notice:", convErr.message);
        }
      }

      const propertyTitle = `${bhk || payload?.unit_type || "Property"} at ${society_name || locality || payload?.location_name}`;

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        property_id: createdPropertyId,
        conversation_id: conversation?.id || null,
        lead_id: leadId,
        property_title: propertyTitle,
        executive_card: {
          executiveId: assignedExec.id,
          executiveName: execFullName,
          executivePhone: assignedExec.phone || "+91 9604350255",
          executiveEmail: assignedExec.email || "support@resaleexpert.in",
          executiveRole: "Property Executive",
          propertyTitle: propertyTitle,
          propertyId: createdPropertyId,
          location: locality || payload?.location_name,
          societyName: society_name,
          unitType: bhk || payload?.unit_type || "Apartment",
          expectedPrice: expected_price || (parsedPrice ? `₹${Number(parsedPrice).toLocaleString("en-IN")}` : ""),
        },
        reply: `Your property listing for ${propertyTitle} has been submitted successfully!\n\n• Assigned Property Executive: ${execFullName}\n• Expected Price: ${expected_price || (parsedPrice ? "₹" + Number(parsedPrice).toLocaleString("en-IN") : "₹0")}\n• Status: Assigned for Executive Review\n\nYour dedicated executive will review the details and initiate physical verification, document check, and buyer matching.`,
        suggestions: ["Chat with Executive", "List Another Property", "Check Active Buyers", "Talk to Property Executive"],
      });
    }

    if (action === "submit_owner_rental_property") {
      const {
        property_type_name = "Residential",
        property_subtype_name = "Apartment / Flat",
        unit_type = "2 BHK",
        location_name = "Baner",
        society_name,
        monthly_rent,
        security_deposit,
        furnishing = "Semi-Furnished",
        owner_name,
        owner_phone,
        owner_email,
      } = payload || {};

      const cleanRent = parseFloat(String(monthly_rent || 0).replace(/[^\d.]/g, "")) || 0;
      const cleanDeposit = parseFloat(String(security_deposit || 0).replace(/[^\d.]/g, "")) || (cleanRent * 2);

      const effectiveEmail = (req.user?.email || owner_email || session.extracted_profile?.email || "").trim().toLowerCase();
      const effectivePhone = req.user?.phone || owner_phone || session.extracted_profile?.phone || null;
      const effectiveName = (req.user ? `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() : owner_name || session.extracted_profile?.name || "Property Owner").trim();

      // 1. Assign dynamic executive using 3-Tier Intelligent Cascading Strategy
      let assignedExec = await resolveDynamicExecutive({
        location: location_name,
        society: society_name,
      });

      if (!assignedExec) {
        assignedExec = {
          id: null,
          first_name: "Sales",
          last_name: "Executive",
          phone: "+91 9637 00 9639",
          email: "support@resaleexpert.in",
          role: "sales executive",
        };
      }

      // Auto-add new society to Property Master (master_values) and societies table if not present
      if (society_name && typeof society_name === "string" && society_name.trim()) {
        const cleanSocName = society_name.trim();
        try {
          // 1. Check & add to master_values under 'Society' master type
          const [socMasterType] = await db.query(
            "SELECT id FROM master_types WHERE tab_id = 'property' AND LOWER(name) = 'society' LIMIT 1"
          );
          if (socMasterType && socMasterType.length > 0) {
            const masterTypeId = socMasterType[0].id;
            const [existingVal] = await db.query(
              "SELECT id FROM master_values WHERE master_type_id = ? AND LOWER(TRIM(value)) = LOWER(?) LIMIT 1",
              [masterTypeId, cleanSocName]
            );
            if (!existingVal || existingVal.length === 0) {
              const { v4: uuidv4 } = require("uuid");
              await db.query(
                "INSERT INTO master_values (id, master_type_id, value, status) VALUES (?, ?, ?, 'Active')",
                [uuidv4(), masterTypeId, cleanSocName]
              );
            }
          }

          // 2. Check & add to societies table if not exists
          const [existSoc] = await db.query(
            "SELECT id FROM societies WHERE LOWER(TRIM(society_name)) = LOWER(?) LIMIT 1",
            [cleanSocName]
          );
          if (!existSoc || existSoc.length === 0) {
            const SocietyModel = require("../models/SocietyModel");
            await SocietyModel.createSociety({
              societyName: cleanSocName,
              locality: location_name || "Pune",
              city: "Pune",
              pincode: "411001",
              status: "Active",
            });
          }
        } catch (socMasterErr) {
          console.warn("Auto-adding society to masters warning:", socMasterErr.message);
        }
      }

      // 2. Create or find Owner lead in `owners` table
      let ownerId = null;
      try {
        if (effectiveEmail || effectivePhone) {
          const [existOwner] = await db.query(
            "SELECT id FROM owners WHERE (email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?) LIMIT 1",
            [effectiveEmail || "", effectivePhone || ""]
          );
          if (existOwner && existOwner.length > 0) {
            ownerId = existOwner[0].id;
          } else {
            const OwnerModel = require("../models/OwnerModel");
            ownerId = await OwnerModel.create({
              name: effectiveName,
              email: effectiveEmail || null,
              phone: effectivePhone || null,
              location: location_name || "Pune",
              assigned_to: assignedExec.id,
              assigned_to_name: `${assignedExec.first_name} ${assignedExec.last_name || ""}`.trim(),
              status: "New",
              stage: "New Lead",
              lead_type: "Owner",
              source: "REX AI Chatbot",
              notes: `Rental Property Listing Owner Lead via REX AI Chatbot for ${unit_type} at ${society_name || location_name}`,
            });
          }
        }
      } catch (oErr) {
        console.warn("Owner lead creation notice:", oErr.message);
      }

      // 3. Create rental property in \`rental_properties\` table
      let createdPropertyId = null;
      try {
        const RentalProperty = require("../models/RentalProperty");
        createdPropertyId = await RentalProperty.create({
          owner_name: effectiveName,
          owner_id: ownerId,
          assigned_to: assignedExec.id,
          property_type_name: property_type_name || "Residential",
          property_subtype_name: property_subtype_name || "Apartment / Flat",
          unit_type: unit_type || "2 BHK",
          city_name: "Pune",
          location_name: location_name || "Pune",
          society_name: society_name || null,
          monthly_rent: cleanRent,
          security_deposit: cleanDeposit,
          furnishing: furnishing || "Semi-Furnished",
          status: "Pending Review",
          lead_source: "REX AI Chatbot",
          listing_type: "rent",
          is_public: 0,
          description: `Listed for Rent via REX AI Chatbot by Owner ${effectiveName}. Assigned to Sales Executive ${assignedExec.first_name} ${assignedExec.last_name || ""}.`,
        });

        if (createdPropertyId) {
          const slug = `${createdPropertyId}-${(society_name || location_name || "rent-property").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          await RentalProperty.updateSlug(createdPropertyId, slug).catch(() => {});
        }
      } catch (pErr) {
        console.error("RentalProperty.create error:", pErr);
      }

      // Update session history if messages provided
      let history = Array.isArray(session.message_history) ? [...session.message_history] : [];
      if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
        for (const m of payload.messages) {
          if (!history.some((h) => h.id === m.id)) {
            history.push({
              id: m.id || `msg_${Date.now()}`,
              sender: m.sender || "user",
              text: m.text || "",
              suggestions: m.suggestions || undefined,
              timestamp: m.timestamp || new Date().toISOString(),
            });
          }
        }
      }

      await RexSessionModel.updateSession(session.session_uuid, {
        currentIntent: "owner",
        isQualified: 1,
        messageHistory: history.slice(-60),
        extractedProfile: {
          ...currentProfile,
          role: "owner",
          name: effectiveName,
          first_name: effectiveName,
          phone: effectivePhone,
          email: effectiveEmail,
        },
        extractedRequirements: {
          ...currentReqs,
          locations: location_name ? [location_name] : currentReqs.locations,
          society_name: society_name || currentReqs.society_name,
          unit_type: unit_type || currentReqs.unit_type,
          budget_max: cleanRent,
          furnishing: furnishing || currentReqs.furnishing,
        },
      });

      const execFullName = `${assignedExec.first_name} ${assignedExec.last_name || ""}`.trim();
      const propertyTitle = `${unit_type} at ${society_name || location_name}`;

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        property_id: createdPropertyId,
        owner_id: ownerId,
        property_title: propertyTitle,
        reply: `Your rental property listing for ${propertyTitle} has been submitted successfully!\n\n• Assigned Sales Executive: ${execFullName}\n• Monthly Rent: ₹${cleanRent.toLocaleString("en-IN")}/mo\n• Security Deposit: ₹${cleanDeposit.toLocaleString("en-IN")}\n• Status: Assigned for Executive Review\n\nYour dedicated executive will review the details and initiate matching with active verified tenants. You can also view interested tenants on your Owner Dashboard.`,
        suggestions: ["Check Interested Tenants", "List Another Rental Property", "Talk to Sales Executive", "Open Owner Dashboard"],
        executive_card: {
          executiveId: assignedExec.id,
          executiveName: execFullName,
          executivePhone: assignedExec.phone || "+91 9604350255",
          executiveEmail: assignedExec.email || "support@resaleexpert.in",
          executiveRole: "Sales Executive",
          propertyTitle: propertyTitle,
          propertyId: createdPropertyId,
          location: location_name,
          societyName: society_name,
          unitType: unit_type,
          monthlyRent: cleanRent,
          securityDeposit: cleanDeposit,
        },
      });
    }

    if (action === "get_listing_status") {
      const effectiveUserId = userId || payload?.userId || null;
      const effectivePhone = req.user?.phone || payload?.phone || session.extracted_profile?.phone || null;
      const effectiveEmail = req.user?.email || payload?.email || session.extracted_profile?.email || null;
      const targetPropertyId = payload?.propertyId || session.extracted_profile?.property_id || null;
      const targetSociety = payload?.society_name || session.extracted_requirements?.society_name || null;

      const prop = await resolveSellerPropertyAndExecutive({
        userId: effectiveUserId,
        userPhone: effectivePhone,
        userEmail: effectiveEmail,
        propertyId: targetPropertyId,
        societyName: targetSociety,
      });

      const society = prop?.society_name || prop?.title || targetSociety || "Your Property";
      const loc = prop?.location_name || prop?.city_name || session.extracted_requirements?.locations?.[0] || "Pune";
      const isPublic = prop ? Boolean(prop.is_public == 1 || prop.is_public === true) : false;
      const hasExecutive = Boolean(prop && prop.assigned_to && prop.exec_first_name);
      const execName = hasExecutive ? `${prop.exec_salutation ? prop.exec_salutation + " " : ""}${prop.exec_first_name} ${prop.exec_last_name || ""}`.trim() : null;

      const statusLabel = isPublic ? "Live & Public (Active Listing)" : (prop?.status === "Available" ? "Available" : "Under Review");
      const execLabel = hasExecutive ? `Assigned to ${execName}` : "Executive Assignment in Progress";
      const stageLabel = isPublic ? "Active Listing • Verified Buyer Matching" : "Document & Society Verification";

      const replyText = `Property Listing Status:\n\n• Property: ${society} (${loc})\n• Status: ${statusLabel}\n• Executive: ${execLabel}\n• Stage: ${stageLabel}\n\n${isPublic 
        ? `Your property is now public and actively visible to verified buyers on Resale Expert. Your assigned executive ${hasExecutive ? execName : "team"} is handling buyer inquiries, verified visits, and paperwork.` 
        : "Our operations team is currently reviewing your property details. A dedicated Property Executive will contact you shortly to verify ownership documents and initiate buyer matching."}`;

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        reply: replyText,
        suggestions: ["Talk to Property Executive", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"],
        property_status: prop ? {
          id: prop.id,
          title: society,
          location: loc,
          is_public: isPublic,
          status: statusLabel,
          has_executive: hasExecutive,
          executive_name: execName,
          executive_phone: prop.exec_phone,
          executive_email: prop.exec_email,
        } : null,
      });
    }

    if (action === "get_property_executive") {
      const isTenant =
        payload?.persona === "tenant" ||
        session.current_intent === "tenant" ||
        session.extracted_profile?.role === "tenant";

      if (isTenant) {
        const replyText = `You are connected with our Dedicated Rental Assistance Desk:\n\n• Dedicated Rental Desk: Tenant Support Team\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Our rental team assists you with owner contact details, physical flat verification, rental agreement drafting, and move-in coordination.\n\nYou can chat, call, or reach us on WhatsApp directly!`;

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Rent in Baner", "Rent in Wakad", "Rent in Hinjewadi", "Modify Filters"],
        });
      }

      const isBuyer =
        payload?.persona === "buyer" ||
        session.current_intent === "buyer" ||
        session.extracted_profile?.role === "buyer";

      if (isBuyer) {
        const replyText = `You are connected with our Dedicated Buyer Advisory Desk:\n\n• Advisory Team: Resale Expert Property Advisory\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Our property advisors assist with verified property visits, legal documentation review, pricing negotiations, and home loan processing.\n\nYou can call, message on WhatsApp, or let me know what property you'd like to visit!`;

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Explore 2 BHK in Pune", "Book Site Visit", "Properties under ₹80L", "Filter Properties"],
        });
      }

      const isOwner =
        payload?.persona === "owner" ||
        session.current_intent === "owner" ||
        session.extracted_profile?.role === "owner";

      if (isOwner) {
        const effectiveUserId = userId || payload?.userId || null;
        const effectivePhone = req.user?.phone || payload?.phone || session.extracted_profile?.phone || null;
        const effectiveEmail = req.user?.email || payload?.email || session.extracted_profile?.email || null;
        const targetPropertyId = payload?.propertyId || session.extracted_profile?.property_id || null;
        const targetSociety = payload?.society_name || session.extracted_requirements?.society_name || null;

        const ownerProp = await resolveOwnerPropertyAndExecutive({
          userId: effectiveUserId,
          userPhone: effectivePhone,
          userEmail: effectiveEmail,
          propertyId: targetPropertyId,
          societyName: targetSociety,
        });

        if (ownerProp && ownerProp.assigned_to && ownerProp.exec_first_name) {
          const execName = `${ownerProp.exec_salutation ? ownerProp.exec_salutation + " " : ""}${ownerProp.exec_first_name} ${ownerProp.exec_last_name || ""}`.trim();
          const execPhone = ownerProp.exec_phone || "+91 9637 00 9639";
          const execEmail = ownerProp.exec_email || "info@resaleexpert.in";
          const society = ownerProp.society_name || ownerProp.title || "your rental property";

          return res.status(200).json({
            success: true,
            session_uuid: session.session_uuid,
            reply: `You are connected with your dedicated Property Executive for ${society}:\n\n• Assigned Executive: ${execName}\n• Direct Phone / WhatsApp: ${execPhone}\n• Email: ${execEmail}\n• Role: Dedicated Rental Property Executive (Tenant verification, Leave & License agreement, key holding)\n\nYou can chat directly with ${ownerProp.exec_first_name || "your executive"}, call, or message on WhatsApp:`,
            suggestions: ["Open Your Dashboard", "Check Interested Tenants", "Rental Agreement Rules", "List Another Rental Property"],
            executive_card: {
              executiveName: execName,
              executiveFirstName: ownerProp.exec_first_name,
              executivePhone: execPhone,
              executiveEmail: execEmail,
              executiveRole: ownerProp.exec_role || "Dedicated Rental Executive",
              propertyTitle: society,
              propertyId: ownerProp.id,
              propertySlug: ownerProp.slug || `${ownerProp.id}`,
              propertyPrice: ownerProp.monthly_rent || 0,
            },
          });
        }

        const replyText = `You are connected with our Dedicated Owner Assistance Desk:\n\n• Dedicated Desk: Property Owner & Landlord Desk\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Our rental team assists you with verified tenant screening, biometric Leave & License agreement drafting, police verification, and move-in coordination.\n\nYou can chat, call, or reach us on WhatsApp directly!`;

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Open Your Dashboard", "Check Interested Tenants", "List Property for Rent", "Rental Agreement Rules"],
          executive_desk: {
            deskName: "Dedicated Owner Assistance Desk",
            phone: "+919637009639",
            displayPhone: "+91 9637 00 9639",
            persona: "owner",
          },
        });
      }

      const isBroker =
        payload?.persona === "broker" ||
        session.current_intent === "broker" ||
        session.extracted_profile?.role === "broker";

      if (isBroker) {
        const replyText = `You are connected with our Dedicated Channel Partner & Broker Desk:\n\n• Partnership Desk: B2B Channel Partner Relations\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Collaboration: Verified Pune inventory access, guaranteed fast commission payouts, dedicated CP relationship manager, and joint client site visit coordination.\n\nYou can call, reach us on WhatsApp, or schedule a partnership discussion!`;

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Channel Partner Registration", "Commission Structure", "Inventory Sharing", "Talk to Partner Desk"],
          executive_desk: {
            deskName: "Dedicated Channel Partner Desk",
            phone: "+919637009639",
            displayPhone: "+91 9637 00 9639",
            persona: "broker",
          },
        });
      }

      const effectiveUserId = userId || payload?.userId || null;
      const effectivePhone = req.user?.phone || payload?.phone || session.extracted_profile?.phone || null;
      const effectiveEmail = req.user?.email || payload?.email || session.extracted_profile?.email || null;
      const targetPropertyId = payload?.propertyId || session.extracted_profile?.property_id || null;
      const targetSociety = payload?.society_name || session.extracted_requirements?.society_name || null;

      const prop = await resolveSellerPropertyAndExecutive({
        userId: effectiveUserId,
        userPhone: effectivePhone,
        userEmail: effectiveEmail,
        propertyId: targetPropertyId,
        societyName: targetSociety,
      });

      const society = prop?.society_name || prop?.title || targetSociety || "your property";
      const loc = prop?.location_name || prop?.city_name || "Pune";
      const hasExecutive = Boolean(prop && prop.assigned_to && prop.exec_first_name);

      if (hasExecutive) {
        const execName = `${prop.exec_salutation ? prop.exec_salutation + " " : ""}${prop.exec_first_name} ${prop.exec_last_name || ""}`.trim();
        const execPhone = prop.exec_phone || "+91 9637 00 9639";
        const execEmail = prop.exec_email || "info@resaleexpert.in";

        let conversationId = null;
        if (effectiveUserId && prop.id) {
          try {
            const [convRows] = await db.query(
              "SELECT id FROM property_conversations WHERE property_id = ? AND user_id = ? LIMIT 1",
              [prop.id, effectiveUserId]
            );
            if (convRows && convRows.length > 0) {
              conversationId = convRows[0].id;
              await db.query("UPDATE property_conversations SET executive_id = ? WHERE id = ?", [prop.assigned_to, conversationId]).catch(() => {});
            } else {
              const newConv = await ChatModel.createOrGetAtomic({
                userId: effectiveUserId,
                propertyId: prop.id,
                executiveId: prop.assigned_to,
                initialMessage: `Hello! I would like to talk with my assigned Property Executive for ${society}.`,
                senderType: "user",
              });
              conversationId = newConv?.conversation?.id || null;
            }
          } catch (cErr) {
            console.warn("Executive conv sync notice:", cErr.message);
          }
        }

        const replyText = `You are connected with your dedicated Property Executive for ${society}:\n\n• Assigned Executive: ${execName}\n• Direct Phone / WhatsApp: ${execPhone}\n• Email: ${execEmail}\n• Role: Dedicated Property Executive (Physical verification, buyer visits, key holding & closing)\n\nYou can chat directly with ${prop.exec_first_name || "your executive"}, call, or message on WhatsApp:`;

        return res.status(200).json({
          success: true,
          session_uuid: session.session_uuid,
          reply: replyText,
          suggestions: ["Check Listing Status", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"],
          executive_card: {
            executiveName: execName,
            executiveFirstName: prop.exec_first_name,
            executivePhone: execPhone,
            executiveEmail: execEmail,
            executiveRole: prop.exec_role || "Dedicated Property Executive",
            propertyTitle: society,
            propertyId: prop.id,
            propertySlug: prop.slug || `${prop.id}`,
            propertyPrice: prop.budget || prop.final_price || 0,
            conversationId,
          },
        });
      }

      // Default fallback if no dedicated executive assigned yet
      const defaultReply = `You can connect with the Resale Expert team directly:\n\n• Dedicated Support: Resale Expert Property Executive Team\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n\nOur assigned Executive handles physical verification, key holding, legal documentation, and verified buyer visits.`;

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        reply: defaultReply,
        suggestions: ["Check Active Buyers in My Locality", "Get Free Property Valuation", "Check Listing Status", "List Another Property"],
        executive_desk: {
          deskName: "Resale Expert Property Executive Team",
          phone: "+919637009639",
          displayPhone: "+91 9637 00 9639",
          persona: "seller",
        },
      });
    }

    if (action === "create_call_request_lead") {
      const { phone, name, timing, persona, location, society_name } = payload || {};
      if (!phone || String(phone).replace(/\D/g, "").length < 10) {
        return res.status(400).json({ success: false, message: "A valid 10-digit mobile number is required" });
      }

      const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
      const cleanName = (name || "").trim() || (req.user ? `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() : "Website Visitor");
      const preferredTiming = timing || "Immediately";
      const effectivePersona = persona || session.current_intent || "tenant";

      let leadId = null;

      // 1. Check if lead already exists in client_leads
      const [existingLeads] = await db.query(
        "SELECT id, name, phone, email, assigned_executive FROM client_leads WHERE phone = ? OR phone LIKE ? LIMIT 1",
        [cleanPhone, `%${cleanPhone}`]
      );

      if (existingLeads && existingLeads.length > 0) {
        leadId = existingLeads[0].id;
        await db.query(
          `UPDATE client_leads 
           SET name = COALESCE(NULLIF(?, ''), name),
               status = 'new',
               priority = 'hot',
               lead_source = 'Website Chatbot - Call Request',
               whatsapp_number = COALESCE(NULLIF(?, ''), whatsapp_number),
               location = COALESCE(NULLIF(?, ''), location),
               updated_at = NOW()
           WHERE id = ?`,
          [cleanName, cleanPhone, location || null, leadId]
        );
      } else {
        // Dynamic Executive Assignment using 3-Tier Intelligent Cascading Strategy
        let assignedExec = null;
        const dynExec = await resolveDynamicExecutive({
          location,
          society: society_name,
        });
        if (dynExec && dynExec.id) {
          assignedExec = dynExec.id;
        }

        const leadType =
          effectivePersona === "tenant"
            ? "Rental Tenant"
            : effectivePersona === "seller"
            ? "Seller"
            : effectivePersona === "owner"
            ? "Rental Owner"
            : "Buyer";

        const [insertRes] = await db.query(
          `INSERT INTO client_leads (
             salutation, name, phone, lead_type, lead_source, whatsapp_number,
             city, location, status, priority, assigned_executive, created_at, updated_at
           ) VALUES ('Mr.', ?, ?, ?, 'Website Chatbot - Call Request', ?, 'Pune', ?, 'new', 'hot', ?, NOW(), NOW())`,
          [cleanName, cleanPhone, leadType, cleanPhone, location || "Pune", assignedExec]
        );
        leadId = insertRes.insertId;
      }

      // Record User Activity Event
      try {
        const UserActivityEvent = require("../models/userActivityEvent.model");
        await UserActivityEvent.recordEvent({
          guest_id: req.body.guest_uuid || session.guest_uuid || null,
          lead_id: leadId,
          source: "chatbot",
          session_id: session.session_uuid,
          event_type: "call_request",
          event_name: "callback_requested",
          payload: {
            name: cleanName,
            phone: cleanPhone,
            timing: preferredTiming,
            persona: effectivePersona,
          },
        });
      } catch (e) {}

      // Trigger automation / CRM notifications
      try {
        const { triggerWelcomeAutomation } = require("../services/automationEngine");
        triggerWelcomeAutomation({
          entityType: "lead",
          entityData: { id: leadId, name: cleanName, phone: cleanPhone, status: "new", priority: "hot" },
        }).catch(() => {});
      } catch (e) {}

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        leadId,
        name: cleanName,
        phone: cleanPhone,
        timing: preferredTiming,
        message: `Call request submitted successfully. Our executive will call you ${preferredTiming === "Immediately" ? "immediately" : preferredTiming}.`,
      });
    }

    if (action === "get_rental_owner_details") {
      const propertyId = payload?.propertyId || payload?.property_id;
      const effectiveUserId = userId || payload?.userId || null;
      const effectiveEmail = (req.user?.email || payload?.email || session.extracted_profile?.email || "").trim().toLowerCase();
      const effectivePhone = req.user?.phone || payload?.phone || session.extracted_profile?.phone || null;
      const effectiveName = (req.user ? `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim() : payload?.name || session.extracted_profile?.name || "Tenant").trim();

      if (!propertyId) {
        return res.status(400).json({ success: false, message: "Property ID required" });
      }

      // 1. Fetch rental property and owner details
      const [propRows] = await db.query(
        `SELECT rp.*,
                o.name AS owner_name_joined, o.phone AS owner_phone_joined,
                o.whatsapp AS owner_whatsapp_joined, o.email AS owner_email_joined,
                o.salutation AS owner_salutation, o.location AS owner_address
         FROM rental_properties rp
         LEFT JOIN owners o ON rp.owner_id = o.id
         WHERE rp.id = ?
         LIMIT 1`,
        [propertyId]
      );

      if (!propRows || propRows.length === 0) {
        return res.status(404).json({ success: false, message: "Rental property not found" });
      }

      const rp = propRows[0];
      const ownerName = rp.owner_name_joined ? `${rp.owner_salutation ? rp.owner_salutation + " " : ""}${rp.owner_name_joined}`.trim() : (rp.owner_name || "Property Owner");
      const ownerPhone = rp.owner_phone_joined || "+91 9637 00 9639";
      const ownerWhatsapp = rp.owner_whatsapp_joined || rp.owner_phone_joined || "919637009639";
      const ownerEmail = rp.owner_email_joined || "support@resaleexpert.in";
      const propertyTitle = rp.society_name ? `${rp.unit_type || ""} at ${rp.society_name}` : `Rental Property #${rp.id}`;

      // 2. Register or update Tenant lead in \`tenants\` table if email/phone provided
      let tenantRecord = null;
      if (effectiveEmail || effectivePhone) {
        try {
          const [existingTenants] = await db.query(
            "SELECT * FROM tenants WHERE (email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?) ORDER BY id DESC LIMIT 1",
            [effectiveEmail || "", effectivePhone || ""]
          );
          if (existingTenants && existingTenants.length > 0) {
            tenantRecord = existingTenants[0];
            try {
              const tenantActivityModel = require("../models/TenantActivity");
              await tenantActivityModel.create({
                tenant_id: tenantRecord.id,
                activity_type: "Inquiry / Owner Contacted",
                notes: `Unlocked owner contact via REX AI Chatbot for RENT-${rp.id} (${propertyTitle})`,
              });
            } catch (aErr) {}
          } else {
            // Create brand new tenant lead!
            const Tenant = require("../models/Tenant");
            tenantRecord = await Tenant.create({
              name: effectiveName,
              email: effectiveEmail || null,
              phone: effectivePhone || null,
              whatsapp: effectivePhone || null,
              preferred_location: rp.location_name || "Pune",
              preferred_bhk: rp.unit_type || "2 BHK",
              status: "Active Search",
              notes: `Tenant Lead via REX AI Chatbot - Interested in ${propertyTitle} (Rent: ₹${rp.monthly_rent || 0})`,
            });
          }
        } catch (tErr) {
          console.warn("Tenant lead creation note in REX controller:", tErr.message);
        }
      }

      const replyText = `Here are the verified contact details for the owner of ${propertyTitle}:\n\n• Owner Name: ${ownerName}\n• Phone: ${ownerPhone}\n• WhatsApp: ${ownerWhatsapp}\n• Email: ${ownerEmail}\n• Monthly Rent: ₹${Number(rp.monthly_rent || 0).toLocaleString("en-IN")}/month\n\nYou can call the owner directly, message on WhatsApp, or view all options on your Tenant Dashboard:`;

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        reply: replyText,
        suggestions: ["Go to Tenant Dashboard", "Explore nearby rentals", "Rental agreement process", "Talk to Property Executive"],
        rental_owner_card: {
          ownerId: rp.owner_id,
          ownerName,
          ownerPhone,
          ownerWhatsapp,
          ownerEmail,
          propertyTitle,
          propertyId: rp.id,
          monthlyRent: rp.monthly_rent,
          location: rp.location_name,
        },
      });
    }

    if (action === "check_user_status") {
      const email = (payload?.email || "").trim().toLowerCase();
      const phone = (payload?.phone || "").replace(/\D/g, "").slice(-10);

      let isRegistered = false;
      let userRole = null;
      let firstName = null;

      if (email || phone) {
        const [uRows] = await db.query(
          "SELECT id, first_name, last_name, email, phone, role FROM users WHERE (email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone LIKE ?) LIMIT 1",
          [email || "", `%${phone || ""}%`]
        );
        if (uRows && uRows.length > 0) {
          isRegistered = true;
          userRole = uRows[0].role;
          firstName = uRows[0].first_name;
        } else {
          // Also check tenants table
          const [tRows] = await db.query(
            "SELECT id, name, email, phone FROM tenants WHERE (email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone LIKE ?) LIMIT 1",
            [email || "", `%${phone || ""}%`]
          );
          if (tRows && tRows.length > 0) {
            isRegistered = true;
            userRole = "tenant";
            firstName = tRows[0].name ? tRows[0].name.split(" ")[0] : "Tenant";
          }
        }
      }

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        is_registered: isRegistered,
        first_name: firstName,
        role: userRole,
      });
    }

    if (action === "get_seller_dynamic_insights") {
      const { locality = "Punawale", bhk = "2 BHK", carpet_area = 750, society_name } = payload || {};
      const locClean = String(locality).trim() || "Punawale";
      const areaNum = parseFloat(String(carpet_area).replace(/[^\d.]/g, "")) || 750;

      let avgRate = 6600;
      let minRate = 6100;
      let maxRate = 7400;
      let propCount = 0;

      try {
        const [rateRows] = await db.query(
          `SELECT 
             MIN(COALESCE(final_price, budget, price) / NULLIF(carpet_area, 0)) AS min_rate,
             MAX(COALESCE(final_price, budget, price) / NULLIF(carpet_area, 0)) AS max_rate,
             AVG(COALESCE(final_price, budget, price) / NULLIF(carpet_area, 0)) AS avg_rate,
             COUNT(*) AS prop_count
           FROM my_properties
           WHERE location_name LIKE ? AND carpet_area > 100 AND (final_price > 100000 OR budget > 100000)`,
          [`%${locClean}%`]
        );

        if (rateRows?.[0]?.avg_rate && Number(rateRows[0].avg_rate) > 2000 && Number(rateRows[0].avg_rate) < 30000) {
          avgRate = Math.round(Number(rateRows[0].avg_rate));
          minRate = rateRows[0].min_rate ? Math.round(Number(rateRows[0].min_rate)) : Math.round(avgRate * 0.92);
          maxRate = rateRows[0].max_rate ? Math.round(Number(rateRows[0].max_rate)) : Math.round(avgRate * 1.08);
          propCount = Number(rateRows[0].prop_count) || 0;
        } else {
          // Locality benchmarks in PCMC/Pune
          const benchmarks = {
            wakad: { avg: 6900, min: 6400, max: 7600 },
            hinjewadi: { avg: 6400, min: 5900, max: 7100 },
            punawale: { avg: 6200, min: 5700, max: 6800 },
            baner: { avg: 8400, min: 7800, max: 9400 },
            balewadi: { avg: 8100, min: 7500, max: 9000 },
            ravet: { avg: 6100, min: 5600, max: 6700 },
            tathawade: { avg: 6300, min: 5800, max: 7000 },
            kharadi: { avg: 7700, min: 7100, max: 8600 },
            kothrud: { avg: 11200, min: 9800, max: 13000 },
          };
          const b = benchmarks[locClean.toLowerCase()] || { avg: 6600, min: 6100, max: 7400 };
          avgRate = b.avg;
          minRate = b.min;
          maxRate = b.max;
        }
      } catch (dbErr) {
        console.warn("Locality rate query notice:", dbErr.message);
      }

      let activeBuyers = 18;
      try {
        const [buyerRows] = await db.query(
          `SELECT COUNT(*) AS total FROM buyers WHERE (preferred_locations LIKE ? OR target_location LIKE ?)`,
          [`%${locClean}%`, `%${locClean}%`]
        );
        if (buyerRows?.[0]?.total && Number(buyerRows[0].total) > 0) {
          activeBuyers = Math.max(12, Number(buyerRows[0].total) * 3 + 5);
        } else {
          activeBuyers = Math.floor(Math.random() * 8) + 16;
        }
      } catch (bErr) {
        activeBuyers = 21;
      }

      const estMinPrice = Math.round(areaNum * minRate);
      const estMaxPrice = Math.round(areaNum * maxRate);

      let readinessScore = 70;
      if (society_name) readinessScore += 10;
      if (bhk) readinessScore += 10;
      if (carpet_area) readinessScore += 10;

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        locality: locClean,
        bhk,
        carpet_area: areaNum,
        society_name: society_name || null,
        valuation: {
          min_rate_sqft: minRate,
          avg_rate_sqft: avgRate,
          max_rate_sqft: maxRate,
          estimated_min_price: estMinPrice,
          estimated_max_price: estMaxPrice,
          comparable_properties_count: propCount,
        },
        active_buyers_count: activeBuyers,
        readiness_score: Math.min(100, readinessScore),
        assigned_executive: "Dedicated Area Relationship Manager",
        sla_minutes: 15,
      });
    }

    if (action === "schedule_later") {
      const { property_id, property_title, property_location, property_price, guest_name, guest_phone, guest_email } = payload || {};
      const propId = Number(property_id);

      let prop = null;
      let executive = {
        id: null,
        name: "Saroj Patil",
        role: "Area Relationship Manager",
        phone: "+91 98220 12345",
        email: "executive@resaleexpert.in",
        avatar: null,
      };

      if (propId) {
        try {
          prop = await Property.getById(propId);
          if (prop) {
            if (prop.assigned_to) {
              const [execRows] = await db.query(
                `SELECT id, first_name, last_name, phone, email, avatar FROM users WHERE id = ?`,
                [prop.assigned_to]
              );
              if (execRows && execRows.length > 0) {
                const u = execRows[0];
                executive = {
                  id: u.id,
                  name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Property Executive",
                  role: "Dedicated Property Executive",
                  phone: u.phone || "+91 98220 12345",
                  email: u.email || "executive@resaleexpert.in",
                  avatar: u.avatar || null,
                };
              }
            }
          }
        } catch (propErr) {
          console.warn("Property lookup notice in schedule_later:", propErr.message);
        }
      }

      const effectiveTitle = property_title || (prop ? (prop.title || prop.location_name || "Property") : "Property");
      const effectiveLoc = property_location || (prop ? prop.location_name : null);
      const effectivePrice = property_price || (prop ? (prop.final_price || prop.budget) : null);

      // Record in Session history
      const history = Array.isArray(session.message_history) ? session.message_history : [];
      history.push({
        id: `sched_later_${Date.now()}`,
        sender: "rex",
        text: `Buyer postponed site visit for ${effectiveTitle}. Handed over to Executive ${executive.name}.`,
        scheduleLater: {
          property_id: propId,
          property_title: effectiveTitle,
          property_location: effectiveLoc,
          property_price: effectivePrice,
          executive_id: executive.id,
          executive_name: executive.name,
          executive_role: executive.role,
          executive_phone: executive.phone,
          executive_email: executive.email,
          postponed_at: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      // Update lead if contact exists
      const effectiveName = req.user?.first_name
        ? `${req.user.first_name} ${req.user.last_name || ""}`.trim()
        : guest_name || session.extracted_profile?.name;
      const effectivePhone = req.user?.phone || guest_phone || session.extracted_profile?.phone;
      const effectiveEmail = req.user?.email || guest_email || session.extracted_profile?.email;

      let leadId = session.lead_id || null;
      if (effectivePhone && !leadId) {
        try {
          const createdLead = await Lead.create({
            name: effectiveName || "Prospective Buyer",
            phone: effectivePhone,
            email: effectiveEmail || null,
            property_id: propId || null,
            lead_type: "buyer",
            lead_source: "REX AI Chatbot (Schedule Later)",
            status: "site_visit_postponed",
            priority: "warm",
          }).catch(() => null);
          if (createdLead?.id) leadId = createdLead.id;
        } catch (e) {
          console.warn("Lead creation notice in schedule_later:", e.message);
        }
      }

      await RexSessionModel.updateSession(session.session_uuid, {
        leadId: leadId || session.lead_id,
        currentIntent: "buyer",
        messageHistory: history,
        isQualified: Boolean(effectivePhone) || session.is_qualified,
      });

      if (global.io && executive.id) {
        global.io.to(`user:${executive.id}`).emit("chat:site_visit_postponed", {
          property_id: propId,
          property_title: effectiveTitle,
          buyer_name: effectiveName,
          buyer_phone: effectivePhone,
          executive_name: executive.name,
          session_uuid: session.session_uuid,
        });
      }

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        executive,
        property: {
          id: propId,
          title: effectiveTitle,
          location: effectiveLoc,
          price: effectivePrice,
        },
        message: "Site visit postponed. Executive assigned.",
      });
    }

    return res.status(400).json({
      success: false,
      message: `Unsupported action: ${action}`,
    });
  } catch (error) {
    console.error("Error in handleAction:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process chatbot action",
    });
  }
};

/**
 * POST /api/rex/schedule-visit
 * Book site visit for a property, create lead, create conversation thread, and alert executive
 */
exports.handleScheduleVisit = async (req, res) => {
  try {
    const {
      property_id,
      visit_date,
      visit_time,
      shift = "Evening",
      guest_name,
      guest_phone,
      guest_email,
      session_uuid,
    } = req.body;

    const userId = req.userId || null;
    const propertyId = Number(property_id);

    if (!propertyId || !visit_date || !visit_time) {
      return res.status(400).json({
        success: false,
        message: "property_id, visit_date, and visit_time are required",
      });
    }

    const property = await Property.getById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    // 1. Ensure Lead Record Exists
    const buyerName = req.user?.first_name
      ? `${req.user.first_name} ${req.user.last_name || ""}`.trim()
      : guest_name || "Prospective Buyer";
    const buyerPhone = req.user?.phone || guest_phone || "0000000000";
    const buyerEmail = req.user?.email || guest_email || null;

    // 1. Check if lead already exists in client_leads or create with dynamic executive
    let leadId = null;
    let assignedExecId = null;
    try {
      const dynExec = await resolveDynamicExecutive({
        propertyId,
        location: property.location,
        society: property.society_name || property.title,
      });
      if (dynExec?.id) {
        assignedExecId = dynExec.id;
      } else if (property.assigned_to) {
        assignedExecId = property.assigned_to;
      }
    } catch (e) {
      console.warn("Could not resolve executive for visit:", e.message);
    }

    try {
      if (buyerEmail || (buyerPhone && buyerPhone !== "0000000000")) {
        const [existingLeads] = await db.query(
          "SELECT id, assigned_executive FROM client_leads WHERE (email IS NOT NULL AND email != '' AND email = ?) OR (phone IS NOT NULL AND phone != '' AND (phone = ? OR phone LIKE ?)) LIMIT 1",
          [buyerEmail, buyerPhone, `%${buyerPhone.slice(-10)}`]
        );
        if (existingLeads.length > 0) {
          leadId = existingLeads[0].id;
          await db.query(
            `UPDATE client_leads 
             SET name = COALESCE(NULLIF(?, ''), name), 
                 phone = COALESCE(NULLIF(?, ''), phone), 
                 status = 'site_visit_scheduled', 
                 priority = 'hot', 
                 property_id = COALESCE(?, property_id), 
                 assigned_executive = COALESCE(assigned_executive, ?),
                 updated_at = NOW() 
             WHERE id = ?`,
            [buyerName, buyerPhone !== "0000000000" ? buyerPhone : null, propertyId, assignedExecId, leadId]
          );
        }
      }

      if (!leadId) {
        const createdLead = await Lead.create({
          name: buyerName,
          phone: buyerPhone,
          email: buyerEmail,
          property_id: propertyId,
          lead_type: "buyer",
          lead_source: "REX AI Site Visit Booking",
          status: "site_visit_scheduled",
          priority: "hot",
          assigned_executive: assignedExecId,
        }).catch(() => null);
        if (createdLead?.id) leadId = createdLead.id;
      }
    } catch (e) {
      console.warn("Lead creation notice in schedule visit:", e.message);
    }

    // 2. Link or Create CRM Buyer Profile (in buyers table)
    let buyerDbId = null;
    try {
      if (buyerPhone || buyerEmail) {
        const [existingBuyers] = await db.query(
          "SELECT id, assigned_executive FROM buyers WHERE (phone IS NOT NULL AND phone != '' AND (phone = ? OR phone LIKE ?)) OR (email IS NOT NULL AND email != '' AND email = ?) ORDER BY id DESC LIMIT 1",
          [buyerPhone, `%${buyerPhone.slice(-10)}`, buyerEmail]
        );
        if (existingBuyers.length > 0) {
          buyerDbId = existingBuyers[0].id;
          await db.query(
            `UPDATE buyers 
             SET name = COALESCE(NULLIF(?, ''), name), 
                 phone = COALESCE(NULLIF(?, ''), phone), 
                 buyer_lead_status = 'site_visit_scheduled', 
                 buyer_lead_stage = 'Site Visit Scheduled', 
                 buyer_lead_priority = 'hot', 
                 assigned_executive = COALESCE(assigned_executive, ?),
                 updated_at = NOW() 
             WHERE id = ?`,
            [buyerName, buyerPhone !== "0000000000" ? buyerPhone : null, assignedExecId, buyerDbId]
          );
        }
      }

      if (!buyerDbId) {
        const createdBuyer = await Buyer.create({
          salutation: "Mr.",
          name: buyerName,
          phone: buyerPhone,
          email: buyerEmail,
          city: property.city || "Pune",
          location: property.location || null,
          buyer_lead_source: "REX AI Site Visit Booking",
          buyer_lead_status: "site_visit_scheduled",
          buyer_lead_stage: "Site Visit Scheduled",
          buyer_lead_priority: "hot",
          assigned_executive: assignedExecId,
        }).catch(() => null);
        if (createdBuyer?.id) {
          buyerDbId = createdBuyer.id;
        }
      }
    } catch (buyerLookupErr) {
      console.warn("Buyer lookup/create notice:", buyerLookupErr.message);
    }

    // 3. Insert into property_visits (linking to CRM buyers table)
    let visitRecord = null;
    try {
      visitRecord = await PropertyVisit.create({
        property_id: propertyId,
        property_title: property.title || property.society_name || null,
        buyer_id: buyerDbId || null,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        buyer_email: buyerEmail,
        seller_id: property.seller_id || null,
        executive_id: assignedExecId || property.assigned_to || null,
        visit_date,
        visit_time,
        status: "scheduled",
        duration_minutes: 60,
        visit_type: "site_visit",
        remarks: `Site visit scheduled via REX AI Chatbot for ${visit_date} at ${visit_time} (${shift})`,
      });
    } catch (visitErr) {
      console.error("PropertyVisit.create error:", visitErr);
    }

    // 3. Create or Link Property Conversation & Send Initial Message
    let conversation = null;
    if (userId) {
      try {
        const convResult = await ChatModel.createOrGetAtomic({
          userId,
          propertyId,
          executiveId: property.assigned_to || 1,
          leadId,
          initialMessage: `Hello! I have scheduled a site visit for ${property.title || "this property"} on ${visit_date} at ${visit_time}.`,
          senderType: "user",
        });
        conversation = convResult.conversation;
      } catch (convErr) {
        console.warn("Chat conversation atomic init notice:", convErr.message);
      }
    }

    // 4. Socket.IO Real-time Alert to Executive
    if (global.io && property.assigned_to) {
      global.io.to(`user:${property.assigned_to}`).emit("chat:site_visit_booked", {
        property_id: propertyId,
        property_title: property.title,
        buyer_name: buyerName,
        buyer_phone: buyerPhone,
        visit_date,
        visit_time,
        conversation_id: conversation?.id || null,
      });
    }

    // 5. Update REX AI Session State & Message History if session_uuid is provided
    if (session_uuid) {
      try {
        const session = await RexSessionModel.getSession(session_uuid);
        if (session) {
          const history = Array.isArray(session.message_history) ? session.message_history : [];
          history.push({
            id: `visit_msg_${Date.now()}`,
            sender: "rex",
            text: `Your site visit for ${property.title || property.society_name || "this property"} has been confirmed for ${visit_date} at ${visit_time} (${shift}).`,
            visit: {
              id: visitRecord?.id || Date.now(),
              property_id: propertyId,
              property_title: property.title || property.society_name || "Residential Property",
              property_address: [property.society_name, property.location_name, property.city_name].filter(Boolean).join(", "),
              property_price: property.final_price || property.budget,
              visit_date,
              visit_time,
              shift,
              executive_id: property.assigned_to,
              executive_name: property.executive_name || "Property Executive",
            },
            timestamp: new Date().toISOString(),
          });

          const profile = session.extracted_profile || {};
          if (buyerName && !profile.name) profile.name = buyerName;
          if (buyerPhone && !profile.phone) profile.phone = buyerPhone;
          if (buyerEmail && !profile.email) profile.email = buyerEmail;

          await RexSessionModel.updateSession(session_uuid, {
            currentIntent: "buyer",
            extractedProfile: profile,
            extractedRequirements: session.extracted_requirements || {},
            messageHistory: history,
            isQualified: true,
            leadId: leadId || session.lead_id,
          });

          if (userId && !session.user_id) {
            const db = require("../config/database");
            await db.execute(`UPDATE rex_agent_sessions SET user_id = ? WHERE session_uuid = ?`, [userId, session_uuid]).catch(() => {});
          }
        }
      } catch (sessErr) {
        console.warn("Could not update session on visit booking:", sessErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Site visit successfully scheduled",
      visit: {
        id: visitRecord?.id || Date.now(),
        property_id: propertyId,
        property_title: property.title || property.society_name || "Residential Property",
        property_address: [property.society_name, property.location_name, property.city_name].filter(Boolean).join(", "),
        property_photos: safeJsonParse(property.photos, []),
        property_price: property.final_price || property.budget,
        visit_date,
        visit_time,
        shift,
        executive_id: property.assigned_to,
        executive_name: property.executive_name || "Property Executive",
      },
      conversation_id: conversation?.id || null,
    });
  } catch (error) {
    console.error("Error in handleScheduleVisit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to schedule site visit",
    });
  }
};

/**
 * GET /api/rex/session/:sessionId
 * Retrieve stored session state and message history
 */
exports.getSessionDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    const session = await RexSessionModel.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    if (session.user_id && req.userId && Number(session.user_id) !== Number(req.userId)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to session" });
    }

    return res.status(200).json({
      success: true,
      session: {
        session_uuid: session.session_uuid,
        intent: session.current_intent,
        profile: session.extracted_profile,
        requirements: session.extracted_requirements,
        history: session.message_history || [],
        is_qualified: Boolean(session.is_qualified),
      },
    });
  } catch (error) {
    console.error("Error in getSessionDetails:", error);
    return res.status(500).json({
      success: false,
    });
  }
};

/**
 * GET /api/rex/sessions
 * List all REX AI sessions for Admin & Executives
 */
exports.listAllSessions = async (req, res) => {
  try {
    const {
      search = "",
      role = "",
      is_qualified = "",
      date_range = "all",
      location = "",
      page = 1,
      limit = 25,
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 25, 100));
    const offset = (parsedPage - 1) * parsedLimit;

    const result = await RexSessionModel.listSessions({
      search,
      role,
      isQualified: is_qualified,
      dateRange: date_range,
      location,
      limit: parsedLimit,
      offset,
    });

    return res.status(200).json({
      success: true,
      sessions: result.sessions,
      metrics: result.metrics || { totalAll: result.total, totalToday: 0, totalQualified: 0, totalBuyers: 0 },
      pagination: {
        total: result.total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(result.total / parsedLimit),
      },
    });
  } catch (error) {
    console.error("Error in listAllSessions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch REX sessions",
    });
  }
};

function safeJsonParse(str, defaultValue = []) {
  if (!str) return defaultValue;
  if (typeof str !== "string") return Array.isArray(str) ? str : defaultValue;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

