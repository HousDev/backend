// backend/services/rexAiService.js
const db = require("../config/database");

/**
 * Helper: Retrieve active OpenAI API key from env or integrations
 */
async function getOpenAiApiKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return process.env.OPENAI_API_KEY.trim();
  }

  try {
    const [rows] = await db.execute(
      `SELECT api_key FROM integrations WHERE provider = 'openai' AND is_active = 1 LIMIT 1`
    );
    if (rows && rows.length > 0 && rows[0].api_key) {
      return rows[0].api_key;
    }
  } catch {
    // Database integration check fallback
  }

  return null;
}

/**
 * System prompt instructing REX to behave as a warm, professional real-estate consultant
 * and return structured JSON containing response, intent, profile, and requirements.
 */
function buildSystemPrompt(knownProfile = {}, knownRequirements = {}) {
  return `You are REX, a professional Real Estate Assistant for "Resale Expert" (resaleexpert.in).

CORE OBJECTIVES:
1. Converse clearly, concisely, and professionally like a top real estate advisor.
2. Progressively understand the user's intent: whether they want to BUY, SELL, RENT, or LIST.
3. Keep responses short and direct (maximum 1 or 2 sentences).
4. If user criteria are provided (e.g. location, budget, configuration like "2 BHK in Wakad"), set "should_search_properties" to true.

STRICT FORMATTING AND STYLE RULES:
- DO NOT use any asterisks, markdown bolding (**text**), or formatting asterisks.
- DO NOT use any emojis.
- Keep all messages clean, short, professional, and readable.

CURRENT KNOWN USER PROFILE:
${JSON.stringify(knownProfile, null, 2)}

CURRENT KNOWN PROPERTY REQUIREMENTS:
${JSON.stringify(knownRequirements, null, 2)}

OUTPUT FORMAT:
You MUST respond with a valid JSON object strictly matching this schema:
{
  "reply": "Your short, clean, plain text response without any asterisks or emojis.",
  "suggestions": ["2 to 4 short clean suggestions without emojis"],
  "intent": "buyer" | "seller" | "tenant" | "owner" | "broker" | "general",
  "should_search_properties": boolean,
  "extracted_profile": {
    "name": "string or null",
    "gender": "string or null",
    "phone": "string or null",
    "email": "string or null",
    "role": "buyer" | "seller" | "tenant" | "owner" | "broker" | null
  },
  "extracted_requirements": {
    "transaction_type": "buy" | "rent" | "sell" | null,
    "city": "string or null",
    "locations": ["array of location names"],
    "property_type": "Residential" | "Commercial" | "Agriculture Land" | null,
    "property_subtype": "Apartment" | "Villa" | "Row House" | "Plot" | "Office" | "Shop" | null,
    "unit_type": "1 BHK" | "2 BHK" | "3 BHK" | "4 BHK" | "Penthouse" | null,
    "bedrooms": number or null,
    "bathrooms": number or null,
    "budget_min": number in Rupees or null,
    "budget_max": number in Rupees or null,
    "carpet_area_min": number in sq ft or null
  },
  "is_qualified": boolean
}`;
}

/**
 * Intelligent Fallback Responder when OpenAI is unreachable or unconfigured
 */
function generateRuleBasedResponse(userMessage, currentProfile = {}, currentRequirements = {}) {
  const lower = userMessage.toLowerCase().trim();
  const profile = { ...currentProfile };
  const reqs = { ...currentRequirements, locations: [...(currentRequirements.locations || [])] };
  let intent = profile.role || "buyer";
  let reply = "";
  let suggestions = [];

  // Extract phone if present
  const phoneMatch = userMessage.match(/\b[6-9]\d{9}\b/);
  if (phoneMatch) {
    profile.phone = phoneMatch[0];
  }

  // Extract email if present
  const emailMatch = userMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    profile.email = emailMatch[0];
  }

  // Extract Name
  const nameMatch = userMessage.match(/(?:my name is|i am|this is)\s+([A-Za-z]+)/i);
  if (nameMatch && nameMatch[1]) {
    const candidateName = nameMatch[1].trim();
    const nonNames = ["looking", "searching", "buying", "selling", "interested", "planning", "a", "an", "the", "here", "ready", "new", "trying"];
    if (!nonNames.includes(candidateName.toLowerCase())) {
      profile.name = candidateName.charAt(0).toUpperCase() + candidateName.slice(1).toLowerCase();
    }
  }

  // Extract Budget
  const crMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/i);
  if (crMatch) {
    reqs.budget_max = Math.trunc(parseFloat(crMatch[1]) * 10000000);
  } else {
    const lakhMatch = userMessage.match(/(\d+(?:\.\d+)?)\s*(?:l|lakh|lac)/i);
    if (lakhMatch) {
      reqs.budget_max = Math.trunc(parseFloat(lakhMatch[1]) * 100000);
    }
  }

  // Extract Bedrooms
  const bhkMatch = userMessage.match(/(\d+)\s*(?:bhk|bedroom|bed)/i);
  if (bhkMatch) {
    const num = parseInt(bhkMatch[1], 10);
    reqs.bedrooms = num;
    reqs.unit_type = `${num} BHK`;
  }

  // Extract Known or Mentioned Cities
  const cities = ["pune", "mumbai", "thane", "bangalore", "delhi", "hyderabad", "pcmc", "navi mumbai"];
  for (const c of cities) {
    if (lower.includes(c)) {
      reqs.city = c.toUpperCase() === "PCMC" ? "PCMC" : c.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }

  // Common Location Typo Corrections
  const typoCorrections = {
    "rahtani": "rahatani",
    "rahtni": "rahatani",
    "rahatni": "rahatani",
    "katrj": "katraj",
    "katraj": "katraj",
    "wakd": "wakad",
    "wakkad": "wakad",
    "punawle": "punawale",
    "punawali": "punawale",
    "hinjwadi": "hinjewadi",
    "hinjewdi": "hinjewadi",
    "hinjawadi": "hinjewadi",
    "banr": "baner",
    "bawdhan": "bavdhan",
    "tathwade": "tathawade",
    "tathawde": "tathawade",
    "kothrd": "kothrud",
    "pimpr": "pimpri",
    "chinchwd": "chinchwad",
    "kharad": "kharadi",
    "hadapsr": "hadapsar",
    "magarpata": "magarpatta",
    "pimplesaudagar": "pimple saudagar",
    "pimplegurav": "pimple gurav",
    "pimplenilakh": "pimple nilakh",
  };

  let normalizedText = lower;
  for (const [typo, fixed] of Object.entries(typoCorrections)) {
    const reg = new RegExp(`\\b${typo}\\b`, "gi");
    normalizedText = normalizedText.replace(reg, fixed);
  }

  // Comprehensive Locality Directory (Pune, PCMC, MMR)
  const commonAreas = [
    // PCMC & West Pune
    "hinjewadi", "wakad", "tathawade", "punawale", "ravet", "kiwale", "mamurdi", "gahunje",
    "baner", "balewadi", "mahalunge", "sus", "bavdhan", "pashan", "aundh",
    "pimple saudagar", "pimple gurav", "pimple nilakh", "rahatani", "kalewadi", "thergaon",
    "pimpri", "chinchwad", "akurdi", "nigdi", "pradhikaran", "dehu road",
    "bhosari", "moshi", "chakan", "talegaon", "alandi", "dighi", "charholi", "dapodi", "sangvi",
    // Central & South Pune
    "katraj", "dhayari", "narhe", "sinhagad road", "ambegaon", "vadgaon", "bibwewadi", "padmavati",
    "kondhwa", "undri", "pisoli", "handewadi", "wanowrie", "salunke vihar", "nibm", "camp",
    "shivajinagar", "kothrud", "karve nagar", "erandwane", "deccan", "model colony", "senapati bapat road",
    // East & North Pune
    "kharadi", "viman nagar", "kalyani nagar", "koregaon park", "wadgaon sheri", "keshav nagar",
    "mundhwa", "magarpatta", "hadapsar", "manjri", "phursungi", "fursungi", "shewalewadi",
    "wagholi", "lohegaon", "dhanori", "vishrantwadi", "tingre nagar", "yerwada",
    // Mumbai / MMR
    "andheri", "bandra", "powai", "borivali", "kandivali", "malad", "goregaon", "thane", "navi mumbai"
  ];

  const newlyMentionedLocs = [];
  for (const area of commonAreas) {
    if (normalizedText.includes(area)) {
      const formatted = area.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!newlyMentionedLocs.includes(formatted)) {
        newlyMentionedLocs.push(formatted);
      }
    }
  }

  // Dynamic regex extraction for unlisted areas (e.g. "in the Katraj area", "in Ravet locality", "property in xyz")
  if (newlyMentionedLocs.length === 0) {
    const areaPatternMatch = normalizedText.match(/(?:in|at|around|near|for|of)\s+(?:the\s+)?([a-zA-Z\s]{3,25}?)\s+(?:area|locality|road|city|region|sector|phase|nagar)/i);
    if (areaPatternMatch && areaPatternMatch[1]) {
      const candidateArea = areaPatternMatch[1].trim();
      const skipWords = ["some", "any", "this", "that", "best", "good", "new", "resale", "other", "all", "different"];
      if (!skipWords.includes(candidateArea.toLowerCase())) {
        const formatted = candidateArea.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        newlyMentionedLocs.push(formatted);
      }
    }
  }

  const isNearbyIntent =
    normalizedText.includes("nearby") ||
    normalizedText.includes("other area") ||
    normalizedText.includes("surrounding") ||
    normalizedText.includes("other properties") ||
    normalizedText.includes("explore nearby") ||
    normalizedText.includes("show other");

  if (newlyMentionedLocs.length > 0) {
    // When user explicitly specifies new location(s), strictly replace previous locations
    reqs.locations = newlyMentionedLocs;
    if (!reqs.city && !newlyMentionedLocs.some(l => ["Andheri", "Bandra", "Powai", "Borivali", "Thane"].includes(l))) {
      reqs.city = "Pune";
    }
  } else if (isNearbyIntent) {
    // Relax location constraint to allow searching nearby/city-wide properties
    reqs.locations = [];
    reqs.city = reqs.city || "Pune";
  }

  // Intent classification
  if (lower.includes("sell") || lower.includes("resale my") || lower.includes("list my property")) {
    intent = "seller";
    profile.role = "seller";
    reqs.transaction_type = "sell";
  } else if (lower.includes("rent") || lower.includes("tenant") || lower.includes("lease")) {
    intent = "tenant";
    profile.role = "tenant";
    reqs.transaction_type = "rent";
  } else if (lower.includes("buy") || lower.includes("purchase") || reqs.budget_max || reqs.bedrooms) {
    intent = "buyer";
    profile.role = "buyer";
    reqs.transaction_type = "buy";
  }

  // Determine if search should trigger
  const hasSearchIntent =
    lower.includes("show") ||
    lower.includes("find") ||
    lower.includes("search") ||
    lower.includes("list") ||
    lower.includes("properties") ||
    lower.includes("flats") ||
    lower.includes("bhk") ||
    reqs.locations.length > 0 ||
    reqs.budget_max != null ||
    reqs.bedrooms != null;

  const should_search_properties = (intent === "buyer" || intent === "tenant") && hasSearchIntent;

  // Formulate short, clean response without asterisks or emojis
  const userNameGreeting = profile.name ? ` ${profile.name}` : "";

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey") || lower.includes("namaste")) {
    reply = `Hello${userNameGreeting}. How can I assist you with your property search today?`;
    suggestions = ["Find 2 BHK in Wakad", "Properties under 80L", "Best areas for investment", "I want to sell my flat"];
  } else if (reqs.bedrooms && reqs.locations.length > 0 && reqs.budget_max) {
    const budgetText = reqs.budget_max >= 10000000 ? `₹${(reqs.budget_max / 10000000).toFixed(2)} Cr` : `₹${(reqs.budget_max / 100000).toFixed(0)} Lakh`;
    reply = `Here are matching ${reqs.unit_type} properties in ${reqs.locations.join(", ")} under ${budgetText}.`;
    suggestions = ["View more properties", "Schedule a site visit", "Under 1 Cr", "Connect with Executive"];
  } else if (reqs.bedrooms && reqs.locations.length > 0) {
    reply = `Here are available ${reqs.unit_type} properties in ${reqs.locations.join(", ")}.`;
    suggestions = ["Under 60 Lakh", "60L to 80L", "80L to 1.2 Cr", "Above 1.2 Cr"];
  } else if (reqs.locations.length > 0) {
    reply = `Here are properties available in ${reqs.locations.join(", ")}.`;
    suggestions = ["1 BHK", "2 BHK", "3 BHK", "Row House"];
  } else if (intent === "seller") {
    reply = `Please share the location, society name, and configuration of your property to list it.`;
    suggestions = ["2 BHK in Wakad", "3 BHK in Baner", "1 BHK in Hinjewadi", "Commercial Shop"];
  } else {
    reply = `Which location and budget range do you prefer?`;
    suggestions = ["2 BHK in Wakad", "Properties in Hinjewadi", "Under 75 Lakh", "3 BHK Apartments"];
  }

  const is_qualified = Boolean((profile.phone || profile.email) && (reqs.locations.length > 0 || reqs.budget_max));

  return {
    reply,
    suggestions,
    intent,
    should_search_properties,
    extracted_profile: profile,
    extracted_requirements: reqs,
    is_qualified,
  };
}

/**
 * Main AI Message Processing Pipeline
 */
exports.processUserMessage = async ({
  userMessage,
  conversationHistory = [],
  currentProfile = {},
  currentRequirements = {},
  authenticatedUser = null,
}) => {
  // Merge authenticated user details if present
  const mergedProfile = { ...currentProfile };
  if (authenticatedUser) {
    if (!mergedProfile.name && (authenticatedUser.first_name || authenticatedUser.last_name)) {
      mergedProfile.name = `${authenticatedUser.first_name || ""} ${authenticatedUser.last_name || ""}`.trim();
    }
    if (!mergedProfile.email && authenticatedUser.email) {
      mergedProfile.email = authenticatedUser.email;
    }
    if (!mergedProfile.phone && authenticatedUser.phone) {
      mergedProfile.phone = authenticatedUser.phone;
    }
    if (!mergedProfile.role && authenticatedUser.role) {
      mergedProfile.role = authenticatedUser.role;
    }
  }

  const apiKey = await getOpenAiApiKey();

  if (!apiKey) {
    // Graceful rule-based intelligence when OpenAI key is not configured
    return generateRuleBasedResponse(userMessage, mergedProfile, currentRequirements);
  }

  try {
    const systemPrompt = buildSystemPrompt(mergedProfile, currentRequirements);

    // Build OpenAI messages array with recent history (last 10 messages)
    const messagesPayload = [{ role: "system", content: systemPrompt }];

    const recentHistory = conversationHistory.slice(-8);
    for (const h of recentHistory) {
      messagesPayload.push({
        role: h.sender === "user" ? "user" : "assistant",
        content: h.text,
      });
    }

    messagesPayload.push({ role: "user", content: userMessage });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesPayload,
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`OpenAI API returned status ${response.status}. Using fallback responder.`);
      return generateRuleBasedResponse(userMessage, mergedProfile, currentRequirements);
    }

    const data = await response.json();
    const contentStr = data.choices?.[0]?.message?.content;

    if (!contentStr) {
      return generateRuleBasedResponse(userMessage, mergedProfile, currentRequirements);
    }

    const parsed = JSON.parse(contentStr);

    // Sanitize and deep-merge extracted profile and requirements
    const finalProfile = { ...mergedProfile };
    if (parsed.extracted_profile) {
      for (const [key, val] of Object.entries(parsed.extracted_profile)) {
        if (val !== null && val !== undefined && val !== "") {
          finalProfile[key] = val;
        }
      }
    }

    const finalReqs = { ...currentRequirements };
    if (parsed.extracted_requirements) {
      for (const [key, val] of Object.entries(parsed.extracted_requirements)) {
        if (val !== null && val !== undefined && val !== "") {
          if (key === "locations" && Array.isArray(val)) {
            const set = new Set([...(finalReqs.locations || []), ...val]);
            finalReqs.locations = Array.from(set);
          } else {
            finalReqs[key] = val;
          }
        }
      }
    }

    const should_search = Boolean(
      parsed.should_search_properties ||
      ((parsed.intent === "buyer" || parsed.intent === "tenant") &&
       (finalReqs.locations?.length > 0 || finalReqs.budget_max != null || finalReqs.bedrooms != null))
    );

    return {
      reply: parsed.reply || "I'm here to assist you with your real estate needs. Could you tell me more about your requirements?",
      suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0 ? parsed.suggestions : ["2 BHK in Wakad", "Properties under ₹80L", "Explore Hinjewadi"],
      intent: parsed.intent || finalProfile.role || "buyer",
      should_search_properties: should_search,
      extracted_profile: finalProfile,
      extracted_requirements: finalReqs,
      is_qualified: Boolean(parsed.is_qualified || ((finalProfile.phone || finalProfile.email) && (finalReqs.locations?.length > 0 || finalReqs.budget_max))),
    };
  } catch (err) {
    console.error("OpenAI call error in rexAiService:", err.message);
    return generateRuleBasedResponse(userMessage, mergedProfile, currentRequirements);
  }
};
