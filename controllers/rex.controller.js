// backend/controllers/rex.controller.js
const RexSessionModel = require("../models/rexSession.model");
const rexAiService = require("../services/rexAiService");
const Property = require("../models/Property");
const Lead = require("../models/Lead");
const Buyer = require("../models/Buyer");
const PropertyVisit = require("../models/PropertyVisit");
const ChatModel = require("../models/chat.model");
const db = require("../config/database");

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

const PUNE_LOCALITY_COORDS = [
  { name: "Wakad", lat: 18.5987, lng: 73.7661 },
  { name: "Tathawade", lat: 18.6186, lng: 73.7507 },
  { name: "Hinjewadi", lat: 18.5913, lng: 73.7389 },
  { name: "Punawale", lat: 18.6322, lng: 73.7438 },
  { name: "Rahatani", lat: 18.6015, lng: 73.7915 },
  { name: "Pimple Saudagar", lat: 18.5987, lng: 73.8000 },
  { name: "Pimple Nilakh", lat: 18.5772, lng: 73.7932 },
  { name: "Baner", lat: 18.5590, lng: 73.7868 },
  { name: "Balewadi", lat: 18.5750, lng: 73.7700 },
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
    hinjewadi: ["Wakad", "Tathawade", "Baner", "Punawale"],
    baner: ["Balewadi", "Wakad", "Hinjewadi", "Pashan"],
    balewadi: ["Baner", "Wakad", "Mahalunge", "Hinjewadi"],
    punawale: ["Tathawade", "Wakad", "Ravet", "Rahatani"],
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

    if (aiResult.should_search_properties) {
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

        // 1. Search with exact filters
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

              aiResult.reply = `Currently, ${unitTypeName ? `${unitTypeName} ` : ""}properties are not available in ${locName}${budgetStr ? ` within ${budgetStr}` : ""}. However, we have ${bhkList} properties available in ${locName}${priceText}. Would you like to explore these or check nearby locations?`;
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
                aiResult.reply = `Currently, no properties are available in ${locName}. Would you like to explore verified properties in nearby locations like ${nearbyLocs.slice(0, 2).join(" & ")}?`;
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
              }
            }
          } else {
            aiResult.reply = `Currently, no properties match your exact criteria. Would you like to adjust your budget or explore other areas in Pune?`;
            aiResult.suggestions = [
              "Show all Pune properties",
              "2 BHK in Wakad",
              "Properties in Hinjewadi",
              "Modify Filters",
            ];
          }

          // STRICT: Ensure searchRes.properties is empty so zero false-positive cards are sent
          searchRes.properties = [];
          searchRes.total = 0;
          searchRes.hasMore = false;
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
          aiResult.reply = `Here are available ${unitDesc}properties in ${locName || "Pune"}${budgetDesc}:`;
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
      show_buyer_filter: Boolean(aiResult.show_buyer_filter),
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
          const lead = await Lead.create({
            name: req.user?.first_name ? `${req.user.first_name} ${req.user.last_name || ""}`.trim() : "Interested Buyer",
            phone: req.user?.phone || currentProfile.phone || "0000000000",
            email: req.user?.email || currentProfile.email || null,
            property_id: propertyId,
            lead_type: "buyer",
            lead_source: "REX AI Chatbot",
            status: "new",
            priority: "hot",
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
            location: locality || "Pune",
          }).catch((err) => {
            console.warn("Notice: Lead create skipped duplicate or error:", err.message);
            return null;
          });
          if (lead?.id) leadId = lead.id;
        } catch (e) {
          console.warn("Seller lead creation notice:", e.message);
        }

        // Provision or link CRM Seller profile in `sellers` table (set to uncontacted)
        try {
          const [existingSellers] = await db.query(
            "SELECT id FROM sellers WHERE (email = ? AND email IS NOT NULL AND email != '') OR (phone = ? AND phone IS NOT NULL AND phone != '') LIMIT 1",
            [effectiveEmail, effectivePhone]
          );
          if (existingSellers && existingSellers.length > 0) {
            sellerEntityId = existingSellers[0].id;
            await db.query(
              "UPDATE sellers SET status = 'uncontacted', stage = 'uncontacted', location = COALESCE(location, ?) WHERE id = ?",
              [locality || null, sellerEntityId]
            );
          } else {
            const [sInsert] = await db.query(
              `INSERT INTO sellers (salutation, name, phone, email, source, status, stage, location, city, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'REX AI Chatbot', 'uncontacted', 'uncontacted', ?, 'Pune', NOW(), NOW())`,
              ['Mr.', effectiveName, effectivePhone, effectiveEmail, locality || null]
            );
            sellerEntityId = sInsert.insertId;
          }

          if (userId && sellerEntityId) {
            await db.query("UPDATE users SET seller_id = ? WHERE id = ?", [sellerEntityId, userId]).catch(() => {});
          }
        } catch (sErr) {
          console.warn("Seller entity sync error:", sErr.message);
        }
      }

      // Create new property in my_properties linked directly to sellerEntityId
      let createdPropertyId = null;
      try {
        const propInsertId = await Property.create({
          seller_name: effectiveName,
          seller_id: sellerEntityId || payload?.seller_id || (userId ? Number(userId) : null) || null,
          property_type_name: "Residential",
          property_subtype_name: "Apartment",
          unit_type: bhk || (parsedBedrooms ? `${parsedBedrooms} BHK` : "Apartment"),
          bedrooms: parsedBedrooms,
          furnishing: furnishing || null,
          city_name: "Pune",
          location_name: locality || null,
          society_name: society_name || null,
          floor: floor || null,
          carpet_area: carpet_area ? String(carpet_area) : null,
          budget: parsedPrice || null,
          final_price: parsedPrice || null,
          status: "Pending Review",
          lead_source: "REX AI Chatbot",
          is_public: 0,
          description: notes || `Submitted via REX AI Chatbot by ${effectiveName}`,
        }).catch((err) => {
          console.error("Failed to insert seller property:", err);
          return null;
        });

        if (propInsertId) {
          createdPropertyId = propInsertId;
          const slug = `${propInsertId}-${(society_name || locality || "property").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
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
      } else {
        history.push({
          id: `seller_sub_${Date.now()}`,
          sender: "bot",
          text: `Your property at ${society_name || "Society"}, ${locality || "Pune"} (${bhk || "Apartment"}) has been submitted for review. Our team will assign a dedicated Property Executive for your property shortly.`,
          sellerConfirmedCard: { data: payload },
          suggestions: ["List Another Property", "Check Listing Status", "Get Free Property Valuation", "Talk to Property Executive"],
          timestamp: new Date().toISOString(),
        });
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
          locations: locality ? [locality] : currentReqs.locations,
          society_name: society_name || currentReqs.society_name,
          bedrooms: parsedBedrooms || currentReqs.bedrooms,
          unit_type: bhk || (parsedBedrooms ? `${parsedBedrooms} BHK` : currentReqs.unit_type),
          budget_max: parsedPrice || currentReqs.budget_max,
          carpet_area: carpet_area || currentReqs.carpet_area,
          furnishing: furnishing || currentReqs.furnishing,
        },
      });

      // 2. Create or link Property Conversation in Human Desk for Executive & Seller
      let conversation = null;
      if (userId && createdPropertyId) {
        try {
          let assignedExecId = 1;
          const [pCheck] = await db.execute(`SELECT assigned_to FROM my_properties WHERE id = ?`, [createdPropertyId]);
          if (pCheck.length > 0 && pCheck[0].assigned_to) {
            assignedExecId = pCheck[0].assigned_to;
          }

          const convResult = await ChatModel.createOrGetAtomic({
            userId,
            propertyId: createdPropertyId,
            executiveId: assignedExecId,
            leadId,
            initialMessage: `New Seller Listing: ${bhk || "Apartment"} in ${society_name || "Society"}, ${locality || "Pune"} (Expected: ${expected_price || "₹" + parsedPrice}). Submitted for executive review.`,
            senderType: "user",
          });
          conversation = convResult.conversation;
        } catch (convErr) {
          console.warn("Seller property conversation atomic init notice:", convErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        session_uuid: session.session_uuid,
        property_id: createdPropertyId,
        conversation_id: conversation?.id || null,
        lead_id: leadId,
        message: "Seller property submitted successfully for review",
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

    let leadId = null;
    try {
      if (buyerEmail || (buyerPhone && buyerPhone !== "0000000000")) {
        const [existingLeads] = await db.query(
          "SELECT id FROM client_leads WHERE (email IS NOT NULL AND email != '' AND email = ?) OR (phone IS NOT NULL AND phone != '' AND (phone = ? OR phone LIKE ?)) LIMIT 1",
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
                 updated_at = NOW() 
             WHERE id = ?`,
            [buyerName, buyerPhone !== "0000000000" ? buyerPhone : null, propertyId, leadId]
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
          "SELECT id FROM buyers WHERE (phone IS NOT NULL AND phone != '' AND (phone = ? OR phone LIKE ?)) OR (email IS NOT NULL AND email != '' AND email = ?) ORDER BY id DESC LIMIT 1",
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
                 updated_at = NOW() 
             WHERE id = ?`,
            [buyerName, buyerPhone !== "0000000000" ? buyerPhone : null, buyerDbId]
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
        executive_id: property.assigned_to || null,
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

