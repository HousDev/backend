const db = require("../config/database");
const Integration = require("../models/integration.model");

/**
 * Helper: Retrieve active OpenAI configuration directly from Settings -> Integrations (DB)
 */
async function getOpenAiConfig() {
  try {
    const chatgptIntegration = await Integration.getByTab("chatgpt");
    if (
      chatgptIntegration &&
      chatgptIntegration.is_active &&
      chatgptIntegration.config &&
      chatgptIntegration.config.api_key &&
      chatgptIntegration.config.api_key.trim()
    ) {
      return {
        apiKey: chatgptIntegration.config.api_key.trim(),
        model: chatgptIntegration.config.model || "gpt-4o-mini",
      };
    }
  } catch (err) {
    console.warn("Could not fetch OpenAI integration from DB:", err.message);
  }

  // Fallback to process.env if available
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return {
      apiKey: process.env.OPENAI_API_KEY.trim(),
      model: process.env.AI_DEFAULT_MODEL || "gpt-4o-mini",
    };
  }

  return null;
}

/**
 * System prompt instructing REX to behave as an intelligent real-estate consultant
 * and return structured JSON containing response, intent, profile, and requirements.
 */
function buildSystemPrompt(knownProfile = {}, knownRequirements = {}) {
  return `You are REX, an intelligent, friendly, and expert Real Estate AI Consultant for "Resale Expert" (resaleexpert.in) in Pune, Maharashtra.

CORE BEHAVIOR & RULES:
1. ALWAYS prioritize the user's LATEST message:
   - If the user provides new search criteria (new location, new budget, new BHK), update the requirements immediately to match their new request.
   - NEVER question or ask the user to adjust or confirm against previous/older search numbers. Always accept their latest budget and location immediately.
   - When criteria (location, BHK, budget) are provided (e.g. "2.5 BHK in Rahatani", "3 BHK in Baner under 1.2 Cr", "2 BHK in Wakad around 70L", "flat in Punawale"), ALWAYS set "should_search_properties": true and "show_buyer_filter": false so matching listings are loaded and shown to the user.
   - If the user generally states "I want to buy property" or asks to buy WITHOUT specific criteria (no location, no BHK, no budget), set "show_buyer_filter": true, "should_search_properties": false, and ask them to select their preferences.

2. Multi-Persona Support:
   - BUYER: Looking to buy flats, apartments, villas, plots. When specific criteria are given, extract location, BHK, budget, set transaction_type: "buy", should_search_properties: true, show_buyer_filter: false. When no specific criteria given (e.g. "i want to buy property"), set show_buyer_filter: true, should_search_properties: false.
   - TENANT: Looking for rental properties. Extract location, BHK, rent budget. Set transaction_type: "rent", should_search_properties: true.
   - SELLER: Looking to sell a property or get property valuation. Guide on valuation, ask for society name/carpet area if needed.
   - OWNER (LANDLORD): Looking to rent out their flat. Assist with listing for rent and tenant matching.
   - BROKER / CHANNEL PARTNER: Real estate agent seeking collaboration or client matching. Offer dedicated executive connection.

3. Suggestions:
   - Provide 2 to 4 actionable, contextual suggestion pills directly relevant to what the user just asked.
   - Examples for a property search: ["Schedule a site visit", "Explore nearby areas", "Connect with Executive", "Modify Filters"].
   - DO NOT suggest "Adjust budget to X" or contradict the user's query.

4. Formatting:
   - Plain text only. Keep sentences concise (1-2 sentences).
   - No asterisks, markdown bolding (**), or emojis in responses.

5. Off-Topic & General Queries:
   - If the user asks questions unrelated to real estate (e.g., weather, chit-chat, coding, general knowledge), provide a polite, brief 1-sentence answer and courteously redirect them back to assisting with their property search, valuation, or site visits in Pune.
   - For off-topic queries, set "should_search_properties": false, "show_buyer_filter": false, and provide helpful property-related suggestion pills.

6. Dynamic Intent & Role Switching (e.g. Buyer -> Seller / Seller -> Buyer):
   - A user can switch goals at any moment in the conversation.
   - If a user previously acted as a BUYER but now expresses interest in SELLING or renting out a property:
     - IMMEDIATELY switch their intent and profile role to "seller".
     - Set "transaction_type": "sell", "should_search_properties": false, "show_buyer_filter": false.
   - Similarly, if a SELLER switches to BUYING, immediately switch intent to "buyer".

CURRENT USER CONTEXT:
Profile: ${JSON.stringify(knownProfile)}
Prior Requirements: ${JSON.stringify(knownRequirements)}

OUTPUT FORMAT:
Respond strictly in valid JSON matching this schema:
{
  "reply": "Short, warm, professional message acknowledging the user's exact request.",
  "suggestions": ["2 to 4 helpful, relevant suggestions"],
  "intent": "buyer" | "seller" | "tenant" | "owner" | "broker" | "general",
  "should_search_properties": boolean,
  "show_buyer_filter": boolean,
  "extracted_profile": {
    "name": string | null,
    "phone": string | null,
    "email": string | null,
    "role": "buyer" | "seller" | "tenant" | "owner" | "broker" | null
  },
  "extracted_requirements": {
    "transaction_type": "buy" | "rent" | "sell" | null,
    "city": "Pune",
    "locations": ["Latest Location Name"],
    "property_type": "Residential" | "Commercial" | null,
    "property_subtype": "Apartment" | "Villa" | "Row House" | "Plot" | null,
    "unit_type": "1 BHK" | "1.5 BHK" | "2 BHK" | "2.5 BHK" | "3 BHK" | "3.5 BHK" | "4 BHK" | "5 BHK" | "6 BHK" | "Penthouse" | "Villa" | null,
    "bedrooms": number | null,
    "budget_min": number | null,
    "budget_max": number | null
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

  // Extract Budget Range or Single Budget
  // Range: e.g. "50L - 80L", "50 to 80 lakh", "₹50L - ₹80L", "80L - 1.2 Cr"
  const rangeMatch = userMessage.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:l|lakh|lakhs|cr|crore|crores)?\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|l|lakh|lakhs|lac|lacs)/i);
  const underMatch = userMessage.match(/(?:under|below|upto|up to|max|within|less than)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|l|lakh|lakhs|lac|lacs)/i);
  const aboveMatch = userMessage.match(/(?:above|more than|min|at least|greater than)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|l|lakh|lakhs|lac|lacs)/i);

  if (rangeMatch) {
    const val1 = parseFloat(rangeMatch[1]);
    const val2 = parseFloat(rangeMatch[2]);
    const unit2 = rangeMatch[3].toLowerCase();
    const mult2 = unit2.startsWith("cr") ? 10000000 : 100000;
    let mult1 = mult2;
    if (mult2 === 10000000 && val1 > 10) {
      mult1 = 100000;
    }
    reqs.budget_min = Math.trunc(val1 * mult1);
    reqs.budget_max = Math.trunc(val2 * mult2);
  } else if (underMatch) {
    const mult = underMatch[2].toLowerCase().startsWith("cr") ? 10000000 : 100000;
    reqs.budget_max = Math.trunc(parseFloat(underMatch[1]) * mult);
    reqs.budget_min = null;
  } else if (aboveMatch) {
    const mult = aboveMatch[2].toLowerCase().startsWith("cr") ? 10000000 : 100000;
    reqs.budget_min = Math.trunc(parseFloat(aboveMatch[1]) * mult);
    reqs.budget_max = null;
  } else {
    const crMatch = userMessage.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/i);
    const lakhMatch = userMessage.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:l|lakh|lakhs|lac|lacs)/i);
    if (crMatch) {
      reqs.budget_max = Math.trunc(parseFloat(crMatch[1]) * 10000000);
    } else if (lakhMatch) {
      reqs.budget_max = Math.trunc(parseFloat(lakhMatch[1]) * 100000);
    }
  }

  // Extract Bedrooms (supports 1, 1.5, 2, 2.5, 3, 4 BHK etc.)
  const bhkMatch = userMessage.match(/\b(\d+(?:\.\d+)?)\s*(?:bhk|bedroom|bed|b\.h\.k)\b/i);
  if (bhkMatch) {
    const rawNum = parseFloat(bhkMatch[1]);
    reqs.bedrooms = rawNum;
    reqs.unit_type = `${bhkMatch[1]} BHK`;
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
      const skipWords = ["some", "any", "this", "that", "best", "good", "new", "resale", "other", "all", "different", "pune", "mumbai"];
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

  const isShowAllIntent =
    normalizedText.includes("show all") ||
    normalizedText.includes("all in pune") ||
    normalizedText.includes("all properties") ||
    normalizedText.includes("browse all") ||
    normalizedText.includes("all projects") ||
    normalizedText.includes("top projects");

  const hasExplicitBhk = Boolean(bhkMatch);
  const hasExplicitBudget = Boolean(rangeMatch || underMatch || aboveMatch || crMatch || lakhMatch);

  if (newlyMentionedLocs.length > 0) {
    // When user explicitly specifies or switches to a location (e.g. "Show all in Ravet", "2 BHK in Wakad"):
    reqs.locations = newlyMentionedLocs;
    if (!reqs.city && !newlyMentionedLocs.some(l => ["Andheri", "Bandra", "Powai", "Borivali", "Thane"].includes(l))) {
      reqs.city = "Pune";
    }
    // If the new query did NOT specify BHK or budget, clear prior query's filters to avoid false zero-matches
    if (!hasExplicitBhk) {
      reqs.bedrooms = null;
      reqs.unit_type = null;
    }
    if (!hasExplicitBudget) {
      reqs.budget_max = null;
      reqs.budget_min = null;
    }
  } else if (isShowAllIntent) {
    // City-wide Pune search (when no specific sub-location mentioned)
    reqs.locations = [];
    reqs.bedrooms = null;
    reqs.unit_type = null;
    reqs.budget_max = null;
    reqs.budget_min = null;
    reqs.city = "Pune";
  } else if (isNearbyIntent) {
    // Relax location constraint to allow searching nearby/city-wide properties
    reqs.locations = [];
    reqs.city = reqs.city || "Pune";
    if (!hasExplicitBhk) {
      reqs.bedrooms = null;
      reqs.unit_type = null;
    }
    if (!hasExplicitBudget) {
      reqs.budget_max = null;
      reqs.budget_min = null;
    }
  } else if (hasExplicitBudget && !hasExplicitBhk && newlyMentionedLocs.length === 0) {
    // If user simply asks "Budget under ₹60L", search in current city
    reqs.bedrooms = null;
    reqs.unit_type = null;
  }

  // Intent classification
  const isSellerQuery =
    lower.includes("sell") ||
    lower.includes("resale my") ||
    lower.includes("list my property") ||
    lower.includes("list another property") ||
    lower.includes("valuation") ||
    lower.includes("market rate") ||
    lower.includes("active buyers");

  const isRentQuery =
    lower.includes("rent") ||
    lower.includes("tenant") ||
    lower.includes("lease");

  const isBuyerQuery =
    lower.includes("buy") ||
    lower.includes("purchase") ||
    lower.includes("searching for") ||
    lower.includes("looking for") ||
    lower.includes("flat") ||
    lower.includes("apartment") ||
    lower.includes("properties") ||
    lower.includes("in budget") ||
    hasExplicitBhk ||
    hasExplicitBudget ||
    newlyMentionedLocs.length > 0;

  if (isSellerQuery) {
    intent = "seller";
    profile.role = "seller";
    reqs.transaction_type = "sell";
  } else if (isRentQuery) {
    intent = "tenant";
    profile.role = "tenant";
    reqs.transaction_type = "rent";
  } else if (isBuyerQuery || profile.role === "buyer") {
    intent = "buyer";
    profile.role = "buyer";
    reqs.transaction_type = "buy";
  } else if (profile.role === "seller") {
    intent = "seller";
    reqs.transaction_type = "sell";
  }

  // Determine if search should trigger (STRICTLY for buyers and tenants only)
  const hasSearchIntent =
    lower.includes("show") ||
    lower.includes("find") ||
    lower.includes("search") ||
    lower.includes("flats") ||
    lower.includes("bhk") ||
    reqs.locations.length > 0 ||
    reqs.budget_max != null ||
    reqs.bedrooms != null;

  const should_search_properties = (intent === "buyer" || intent === "tenant") && hasSearchIntent;

  // Formulate short, clean response without asterisks or emojis
  const userNameGreeting = profile.name ? ` ${profile.name}` : "";

  if (intent === "seller") {
    if (lower.includes("valuation") || lower.includes("market rate") || lower.includes("estimate") || lower.includes("price")) {
      reply = `Our automated Pune valuation model estimates market rates between ₹6,200 – ₹9,800/sq.ft. Please share your society name and carpet area to calculate an exact resale estimate and active buyer count.`;
      suggestions = ["List My Property", "Check Active Buyers in My Locality", "Talk to Property Executive"];
    } else if (lower.includes("active buyers") || lower.includes("buyers")) {
      reply = `We currently have over 380+ active verified buyers seeking 1, 2 & 3 BHK flats across Wakad, Punawale, Hinjewadi, and Baner. Please submit your property details to match directly with buyers.`;
      suggestions = ["Get Free Property Valuation", "List My Property", "Talk to Property Executive"];
    } else if (lower.includes("executive") || lower.includes("contact") || lower.includes("call")) {
      reply = `Our dedicated Property Executives provide 100% managed resale: physical inspection, document verification, professional photography, and zero spam calls.`;
      suggestions = ["Get Free Property Valuation", "List My Property", "Check Active Buyers in My Locality"];
    } else {
      reply = `Resale Expert provides 100% managed resale services with a dedicated executive, verified buyer matching, and zero spam calls. Please provide your society name and configuration:`;
      suggestions = ["Get Free Property Valuation", "Check Active Buyers in My Locality", "Talk to Property Executive"];
    }
  } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey") || lower.includes("namaste")) {
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
  } else {
    reply = `Please specify your preferences below (Configuration, Locality, and Budget) to view matching verified properties in Pune:`;
    suggestions = ["2 BHK in Wakad", "Properties in Hinjewadi", "3 BHK in Baner", "Budget under ₹60L"];
  }

  const show_buyer_filter = Boolean(
    intent === "buyer" &&
    !should_search_properties &&
    (!reqs.locations || reqs.locations.length === 0) &&
    !reqs.bedrooms &&
    !reqs.budget_max
  );

  const is_qualified = Boolean((profile.phone || profile.email) && (reqs.locations.length > 0 || reqs.budget_max));

  return {
    reply,
    suggestions,
    intent,
    should_search_properties,
    show_buyer_filter,
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

  const aiConfig = await getOpenAiConfig();

  if (!aiConfig || !aiConfig.apiKey) {
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
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model || "gpt-4o-mini",
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
          if (key === "locations" && Array.isArray(val) && val.length > 0) {
            // Replace with newly extracted locations directly - do NOT accumulate stale areas
            finalReqs.locations = val;
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

    const show_buyer_filter = Boolean(
      parsed.show_buyer_filter ||
      (!should_search && (parsed.intent === "buyer" || finalProfile.role === "buyer") &&
       (!finalReqs.locations || finalReqs.locations.length === 0) &&
       !finalReqs.bedrooms &&
       !finalReqs.budget_max)
    );

    return {
      reply: parsed.reply || "I'm here to assist you with your real estate needs. Could you tell me more about your requirements?",
      suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0 ? parsed.suggestions : ["2 BHK in Wakad", "Properties under ₹80L", "Explore Hinjewadi"],
      intent: parsed.intent || finalProfile.role || "buyer",
      should_search_properties: should_search,
      show_buyer_filter,
      extracted_profile: finalProfile,
      extracted_requirements: finalReqs,
      is_qualified: Boolean(parsed.is_qualified || ((finalProfile.phone || finalProfile.email) && (finalReqs.locations?.length > 0 || finalReqs.budget_max))),
    };
  } catch (err) {
    console.error("OpenAI call error in rexAiService:", err.message);
    return generateRuleBasedResponse(userMessage, mergedProfile, currentRequirements);
  }
};

/**
 * Generate Dynamic AI Smart Reply Suggestions for Property Executives
 */
exports.generateExecutiveSmartReplies = async ({
  clientName = "Client",
  clientFirst = "there",
  propertyTitle = "this property",
  propertyLocation = "Pune",
  propertyPrice = "",
  lastClientMessage = "",
  conversationHistory = [],
}) => {
  const openAiConfig = await getOpenAiConfig();

  if (openAiConfig && openAiConfig.apiKey) {
    try {
      const messagesPrompt = [
        {
          role: "system",
          content: `You are an expert Real Estate Sales AI Assistant for Resale Expert.
Your task is to generate 3 to 4 short, professional, highly contextual, and high-converting reply options for the Property Executive to send to the buyer/client in response to their latest message.

Property Context:
- Property Title: ${propertyTitle}
- Location: ${propertyLocation}
- Price: ${propertyPrice || "Market Rate"}
- Client Name: ${clientName} (${clientFirst})

Guidelines:
1. Provide distinct reply angles:
   - Site Visit / Walkthrough Booking (e.g. asking preferred date/time)
   - Floor Plan & Detailed Pricing Breakdown
   - Quick 2-Minute Call Request
   - Direct helpful answer to their question
2. Keep each reply natural, warm, and concise (1-2 sentences).
3. Return ONLY valid JSON with this structure:
{
  "suggestions": [
    {
      "id": "reply_1",
      "label": "Site Visit Slot",
      "category": "visit",
      "reply_text": "Hello ${clientFirst}! Would you like to schedule an in-person site visit for ${propertyTitle} this weekend? Let me know which time slot works best for you."
    }
  ]
}`,
        },
        ...conversationHistory.slice(-5).map((m) => ({
          role: m.sender_type === "user" ? "user" : "assistant",
          content: m.message_text || m.text || "",
        })),
        {
          role: "user",
          content: `Latest Client Message: "${lastClientMessage || `Hi, I am interested in ${propertyTitle}`}". Please generate 4 smart reply suggestions for the sales executive.`,
        },
      ];

      const https = require("https");
      const postData = JSON.stringify({
        model: openAiConfig.model || "gpt-4o-mini",
        messages: messagesPrompt,
        temperature: 0.7,
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      const response = await new Promise((resolve, reject) => {
        const req = https.request(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiConfig.apiKey}`,
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          }
        );
        req.on("error", reject);
        req.write(postData);
        req.end();
      });

      if (response?.choices?.[0]?.message?.content) {
        const parsed = JSON.parse(response.choices[0].message.content);
        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          return parsed.suggestions;
        }
      }
    } catch (llmErr) {
      console.warn("LLM smart replies fallback:", llmErr.message);
    }
  }

  // Dynamic Rule-Based Smart Reply Generator
  const cleanMsg = String(lastClientMessage || "").toLowerCase();
  const suggestions = [];

  if (
    cleanMsg.includes("visit") ||
    cleanMsg.includes("see") ||
    cleanMsg.includes("book") ||
    cleanMsg.includes("time") ||
    cleanMsg.includes("slot") ||
    cleanMsg.includes("reschedule") ||
    cleanMsg.includes("later")
  ) {
    suggestions.push({
      id: "visit_slot",
      label: "Confirm Visit Time",
      category: "visit",
      reply_text: `Hello ${clientFirst}! Are you available for an on-site visit for ${propertyTitle} today or tomorrow? Let me know your convenient time slot.`,
    });
    suggestions.push({
      id: "share_location",
      label: "Share Location Pin",
      category: "location",
      reply_text: `Here are the location and landmark details for ${propertyTitle}: ${propertyLocation}. We can also guide you directly when you arrive on site.`,
    });
  } else if (
    cleanMsg.includes("price") ||
    cleanMsg.includes("cost") ||
    cleanMsg.includes("budget") ||
    cleanMsg.includes("discount") ||
    cleanMsg.includes("negotiable") ||
    cleanMsg.includes("lakh") ||
    cleanMsg.includes("cr")
  ) {
    suggestions.push({
      id: "pricing_breakdown",
      label: "Share Price Breakdown",
      category: "pricing",
      reply_text: `Hello ${clientFirst}, the expected price for ${propertyTitle} is ${propertyPrice || "market negotiable"}. I can share the complete cost sheet and breakdown with you.`,
    });
    suggestions.push({
      id: "loan_check",
      label: "Home Loan Check",
      category: "pricing",
      reply_text: `We provide zero-fee home loan assistance with leading partner banks (SBI, HDFC, ICICI). Would you like a quick eligibility check?`,
    });
  } else if (
    cleanMsg.includes("photo") ||
    cleanMsg.includes("video") ||
    cleanMsg.includes("plan") ||
    cleanMsg.includes("layout") ||
    cleanMsg.includes("carpet") ||
    cleanMsg.includes("area")
  ) {
    suggestions.push({
      id: "share_brochure",
      label: "Send Floor Plan & Specs",
      category: "info",
      reply_text: `I'd be glad to share the detailed floor plan, high-resolution photos, and carpet area specifications for ${propertyTitle}. Shall I send them here?`,
    });
  }

  // Always include standard high-converting executive options
  if (suggestions.length < 4) {
    suggestions.push({
      id: "quick_call",
      label: "Request 2-Min Call",
      category: "call",
      reply_text: `Hello ${clientFirst}, may I have the best time to connect with you for a quick 2-minute call to discuss ${propertyTitle} and answer your queries?`,
    });
  }

  if (suggestions.length < 4) {
    suggestions.push({
      id: "welcome_assist",
      label: "Welcome & Connect",
      category: "general",
      reply_text: `Hello ${clientFirst}! Glad to connect with you. How can I assist you with ${propertyTitle} in ${propertyLocation} today?`,
    });
  }

  if (suggestions.length < 4) {
    suggestions.push({
      id: "book_visit_prompt",
      label: "Schedule Site Visit",
      category: "visit",
      reply_text: `Would you like to schedule an in-person site visit for ${propertyTitle} this week to inspect the property and amenities?`,
    });
  }

  return suggestions.slice(0, 4);
};
