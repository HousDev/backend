// backend/controllers/rex.controller.js
const RexSessionModel = require("../models/rexSession.model");
const rexAiService = require("../services/rexAiService");
const Property = require("../models/Property");
const Lead = require("../models/Lead");
const PropertyVisit = require("../models/PropertyVisit");
const ChatModel = require("../models/chat.model");

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

  return {
    id: p.id,
    slug: p.slug || `${p.id}`,
    title: p.title || `${p.unit_type || ""} ${p.property_subtype_name || p.property_type_name || "Property"}`.trim(),
    property_type: p.property_type_name || null,
    property_subtype: p.property_subtype_name || null,
    unit_type: p.unit_type || null,
    bedrooms: p.bedrooms || null,
    bathrooms: p.bathrooms || null,
    carpet_area: p.carpet_area || p.builtup_area || null,
    city: p.city_name || null,
    location: p.location_name || null,
    society: p.society_name || null,
    price: Number(p.price || p.final_price || p.budget || 0),
    photos,
    assigned_to: p.assigned_to || null,
    is_featured: Boolean(p.is_featured),
    is_premium: Boolean(p.is_premium),
  };
}

/**
 * POST /api/rex/chat
 * Send a message to REX AI Agent, extract filters, and fetch 5 matching properties
 */
exports.handleChatMessage = async (req, res) => {
  try {
    const { message, session_uuid, guest_uuid } = req.body;

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

    // 2. Process message through REX AI Engine
    const aiResult = await rexAiService.processUserMessage({
      userMessage: trimmedMsg,
      conversationHistory: history,
      currentProfile: session.extracted_profile || {},
      currentRequirements: session.extracted_requirements || {},
      authenticatedUser,
    });

    // 3. Perform 5-Card Paginated Search if criteria detected
    let foundProperties = [];
    let paginationInfo = { total: 0, limit: 5, offset: 0, hasMore: false, remaining: 0 };

    if (aiResult.should_search_properties) {
      try {
        const reqs = aiResult.extracted_requirements || {};
        const searchFilters = {
          city: reqs.city || null,
          locations: reqs.locations || [],
          propertyType: reqs.property_type || null,
          propertySubtype: reqs.property_subtype || null,
          unitType: reqs.unit_type || null,
          bedrooms: reqs.bedrooms || null,
          budgetMin: reqs.budget_min || null,
          budgetMax: reqs.budget_max || null,
        };

        const hasSpecificLocation = Array.isArray(searchFilters.locations) && searchFilters.locations.length > 0;
        const locName = hasSpecificLocation ? searchFilters.locations.join(", ") : "";

        const searchRes = await Property.searchPublicPropertiesPaginated(searchFilters, 5, 0);
        foundProperties = (searchRes.properties || []).map(sanitizePropertyForChat);
        paginationInfo = {
          total: searchRes.total,
          limit: searchRes.limit,
          offset: searchRes.offset,
          hasMore: searchRes.hasMore,
          remaining: searchRes.remaining,
        };

        if (hasSpecificLocation) {
          // STRICT EXACT LOCATION MATCHING:
          // Never mix properties from unrelated areas into the results.
          if (foundProperties.length === 0) {
            aiResult.reply = `No properties currently found in ${locName}. Would you like to explore verified properties in nearby areas like Wakad or Tathawade?`;
            aiResult.suggestions = [
              "Explore nearby areas",
              "Properties in Wakad",
              "Properties in Tathawade",
              "Show all in Pune"
            ];
          } else if (foundProperties.length <= 2 && !paginationInfo.hasMore) {
            aiResult.reply = `Here are the ${foundProperties.length} properties available in ${locName}. Would you like to see properties in nearby areas as well?`;
            aiResult.suggestions = [
              "Explore nearby areas",
              "Properties in Wakad",
              "Schedule a site visit"
            ];
          } else {
            aiResult.reply = `Here are properties available in ${locName}.`;
            aiResult.suggestions = [
              `1 BHK in ${locName}`,
              `2 BHK in ${locName}`,
              `3 BHK in ${locName}`,
              "Schedule a site visit"
            ];
          }
        } else {
          // If no specific area was given (e.g. city-wide or general browse)
          if (foundProperties.length === 0 && reqs.city) {
            const relaxedRes = await Property.searchPublicPropertiesPaginated(
              { city: reqs.city },
              5,
              0
            );
            if (relaxedRes.properties?.length > 0) {
              foundProperties = relaxedRes.properties.map(sanitizePropertyForChat);
              paginationInfo = {
                total: relaxedRes.total,
                limit: relaxedRes.limit,
                offset: relaxedRes.offset,
                hasMore: relaxedRes.hasMore,
                remaining: relaxedRes.remaining,
              };
            }
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
    const userId = req.userId || null;
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
        reply: `Excellent choice! Would you like to schedule a site visit for **${propertyData?.title || "this property"}**?`,
        suggestions: ["Today", "Tomorrow", "Select Custom Date"],
        property: propertyData,
        lead_id: leadId,
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
    } catch (e) {
      console.warn("Lead creation notice in schedule visit:", e.message);
    }

    // 2. Insert into property_visits
    let visitRecord = null;
    try {
      visitRecord = await PropertyVisit.create({
        property_id: propertyId,
        buyer_id: userId || null,
        seller_id: property.seller_id || null,
        executive_id: property.assigned_to || null,
        lead_id: leadId,
        visit_date,
        visit_time,
        visit_status: "scheduled",
        shift,
        notes: `Site visit scheduled via REX AI Chatbot for ${visit_date} at ${visit_time}`,
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

