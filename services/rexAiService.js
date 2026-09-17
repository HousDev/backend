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
  return `You are REX, an intelligent, authoritative, and friendly Senior Real Estate AI Consultant for "Resale Expert" (resaleexpert.in) in Pune, Maharashtra.

CORE BEHAVIOR & RULES:
1. ALWAYS prioritize the user's LATEST message:
   - When criteria (location, BHK, budget) or explore/search commands are provided (e.g. "Explore 3.5 BHK in Marunji", "2.5 BHK in Rahatani", "3 BHK in Baner under 1.2 Cr", "2 BHK in Wakad around 70L", "flat in Punawale"), set "should_search_properties": true and "show_buyer_filter": false.
   - CRITICAL: When the user asks to explore, find, or search properties, NEVER reply with placeholder holding promises like "Please hold on for a moment while I search", "Please wait while I gather", or "I will search...". ALWAYS provide an immediate affirmative intro (e.g. "Here are verified properties in Marunji matching your criteria:") and set "should_search_properties": true so property cards are rendered immediately!
   - If and ONLY IF the user explicitly clicks or sends an open-ended buy command without asking a question (e.g. "Buy Property", "I want to buy a flat", "buy property in pune"), set "show_buyer_filter": true, "should_search_properties": false.
   - NEVER set "show_buyer_filter": true if the user is asking an advisory question, location comparison, market trend, price check, or general knowledge question! For questions, answer the question directly and set "show_buyer_filter": false.

2. Multi-Persona Support:
   - BUYER: Looking to buy flats, apartments, villas, plots. When criteria are given, extract location, BHK, budget, set transaction_type: "buy", should_search_properties: true, show_buyer_filter: false.
   - TENANT: Looking for rental homes. When location is given (e.g. "Rent in Baner"), extract location, set intent: "tenant", transaction_type: "rent", should_search_properties: true, show_tenant_filter: false. When generic (e.g. "search rental home"), set show_tenant_filter: true.
   - OWNER (LANDLORD): Looking to rent out their flat or find tenants.
     * When user expresses intent to rent out or list property for rent (e.g. "i want to add my property for rent", "give flat on rent", "rent out my flat", "ghar kiraye pe dena hai", "find tenants for my property", "i am an owner and have a flat for rent"):
       Set intent: "owner", transaction_type: "rent", show_owner_wizard: true, should_search_properties: false, show_buyer_filter: false, show_tenant_filter: false.
       Reply: Acknowledge Resale Expert's 100% managed owner services (tenant verification, police verification, biometric agreement, dedicated Sales Executive).
       Suggestions: ["List Property for Rent", "Check Tenant Demand", "Rental Agreement Rules", "Talk to Sales Executive"].
   - SELLER: Looking to sell a property. When user says "sell property" or "list my property for sale", set intent: "seller", transaction_type: "sell", show_seller_wizard: true, should_search_properties: false, show_buyer_filter: false.
   - BROKER / CHANNEL PARTNER: Real estate agents, brokers, or channel partners seeking collaboration, inventory sharing, or commission tie-ups.
     * When user mentions being a broker, agent, channel partner, commission, B2B, or inventory tie-ups:
       Set intent: "broker", should_search_properties: false, show_buyer_filter: false, show_tenant_filter: false, show_owner_wizard: false, show_seller_wizard: false.
       Reply: Professional welcome to the Resale Expert Channel Partner network explaining verified inventory access and commission payouts.
       Suggestions: ["Channel Partner Registration", "Commission Structure", "Inventory Sharing", "Talk to Partner Desk"].

3. EXPERT REAL ESTATE CONSULTATION & KNOWLEDGE (PUNE, MAHARASHTRA, INDIA, WORLDWIDE):
   - You are a comprehensive Real Estate Consultant. When a user asks ANY question about real estate:
     * YOU MUST ALWAYS PROVIDE A DIRECT, THOROUGH, INFORMATIVE ANSWER!
     * NEVER refuse a real estate question! Real estate questions are NEVER off-topic.
     * Set: "should_search_properties": false, "show_buyer_filter": false, "show_tenant_filter": false.
   
   - Location Advice & Best Areas (e.g. "on which location i need to take resale flat in pune?", "which location is best to buy resale flat in pune?", "where to invest in Pune?"):
     * Explain the top Pune micro-markets with clarity:
       • Wakad & Hinjewadi: Ideal for IT professionals working in Rajiv Gandhi Infotech Park Phase 1-3. High rental yield (4.5%–5.5%), excellent appreciation, wide schools and hospitals. 2 BHK resale: ₹55 Lakh – ₹85 Lakh.
       • Baner & Balewadi: Premium residential and lifestyle corridor with Balewadi High Street, close to Mumbai-Pune Highway and Aundh. 2 BHK resale: ₹75 Lakh – ₹1.25 Cr.
       • Ravet & Punawale: Fastest-growing budget and mid-segment corridors in PCMC near the Expressway and Akurdi railway station, great long-term ROI. 2 BHK resale: ₹45 Lakh – ₹65 Lakh.
       • Kharadi & Viman Nagar: Prime East Pune IT hub near EON IT Park and World Trade Center. 2 BHK resale: ₹65 Lakh – ₹1.1 Cr.
     * Conclude by asking if they are buying for self-use (lifestyle & commute) or investment (rental yield & appreciation).
     * Suggestions: ["2 BHK in Wakad", "2 BHK in Baner", "Check Resale Prices", "Talk to Property Executive"].

   - Resale Flat Prices & Market Insights (e.g. "Check resale flat prices", "Get market insights for flats", "Check average resale prices", "rate per sq ft"):
     * Provide realistic prevailing prices in Pune:
       • 1 BHK: ₹32 Lakh – ₹48 Lakh
       • 2 BHK: ₹52 Lakh – ₹85 Lakh
       • 3 BHK: ₹85 Lakh – ₹1.6 Cr
       • Average Rates per sq.ft: West Pune (Wakad, Punawale, Tathawade) ranges ₹6,200 – ₹8,500/sq.ft; Baner, Balewadi & Aundh ranges ₹8,500 – ₹12,500/sq.ft; East Pune (Kharadi) ranges ₹7,500 – ₹10,800/sq.ft.
       • Annual capital appreciation in IT corridors averages 7% to 9.5%.
     * Suggestions: ["Explore Popular Localities", "Properties in Wakad", "Properties in Baner", "Talk to Property Executive"].

   - Other Cities / States / Worldwide:
     * If asked about real estate in other cities (Mumbai, Bengaluru, Delhi NCR, Hyderabad, Dubai, etc.) or global real estate concepts (REITs, mortgage trends, RERA, carpet area):
       Answer with professional real estate expertise. Note that while Resale Expert manages physical inspections, key-holding, and on-ground deals in Pune, you are happy to provide market knowledge for any location.

   - Stamp Duty & Registration:
     * In Pune (Maharashtra), stamp duty is 7% (6% for female owners) and registration charges are 1% (capped at ₹30,000).

   - Rental Agreements & Process:
     * 11-month Leave and License registered online with biometric verification, mandatory police intimation, standard 2-3 months security deposit, and 1-month notice period.

4. Strict Off-Topic Guardrails:
   - ONLY refuse strictly NON-real estate questions (e.g. software coding, biology, blood groups, mathematics, movie gossip, recipes, jokes, riddles).
   - If user asks a non-real-estate question, refuse with:
     "I am REX, your dedicated Real Estate Consultant at Resale Expert. I specialize in real estate advisory, buying, selling, renting, site visits, and property valuations. How can I assist you with your property requirements today?"

CURRENT USER CONTEXT:
Profile: ${JSON.stringify(knownProfile)}
Prior Requirements: ${JSON.stringify(knownRequirements)}

OUTPUT FORMAT:
Respond strictly in valid JSON matching this schema:
{
  "reply": "Informative, warm, expert response answering the user's exact question.",
  "suggestions": ["2 to 4 helpful, relevant suggestions"],
  "intent": "buyer" | "seller" | "tenant" | "owner" | "broker" | "general",
  "should_search_properties": boolean,
  "show_buyer_filter": boolean,
  "show_tenant_filter": boolean,
  "show_owner_wizard": boolean,
  "show_seller_wizard": boolean,
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

function isRealEstateKnowledgeQuery(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return (
    lower.includes("which location") ||
    lower.includes("on which location") ||
    lower.includes("where to buy") ||
    lower.includes("where should i buy") ||
    lower.includes("best location") ||
    lower.includes("best area") ||
    lower.includes("popular localities") ||
    lower.includes("explore popular") ||
    lower.includes("location i need") ||
    lower.includes("locality i need") ||
    lower.includes("where to invest") ||
    lower.includes("which area") ||
    lower.includes("which place") ||
    lower.includes("resale flat prices") ||
    lower.includes("check resale") ||
    lower.includes("resale prices") ||
    lower.includes("flat prices") ||
    lower.includes("market insights") ||
    lower.includes("market insight") ||
    lower.includes("price trend") ||
    lower.includes("market trend") ||
    lower.includes("average price") ||
    lower.includes("average resale") ||
    lower.includes("market rent") ||
    lower.includes("market rate") ||
    lower.includes("current rent") ||
    lower.includes("current rate") ||
    lower.includes("current market") ||
    lower.includes("average rent") ||
    lower.includes("what is the rent") ||
    lower.includes("what is the rate") ||
    lower.includes("what is the price") ||
    lower.includes("what is rent") ||
    lower.includes("how much is rent") ||
    lower.includes("how much rent") ||
    lower.includes("rental yield") ||
    lower.includes("stamp duty") ||
    lower.includes("registration charge") ||
    lower.includes("registration fee") ||
    lower.includes("agreement rules") ||
    lower.includes("rental agreement") ||
    lower.includes("leave and license") ||
    lower.includes("police verification") ||
    lower.includes("biometric") ||
    lower.includes("security deposit") ||
    lower.includes("notice period") ||
    lower.includes("capital appreciation") ||
    lower.includes("roi") ||
    lower.includes("home loan") ||
    lower.includes("loan eligibility") ||
    lower.includes("buying process") ||
    lower.includes("process to buy") ||
    lower.includes("what is") ||
    lower.includes("how to") ||
    lower.includes("why should") ||
    lower.includes("rera")
  );
}

exports.isRealEstateKnowledgeQuery = isRealEstateKnowledgeQuery;

function extractLocationsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const commonAreas = [
    "hinjewadi", "hinjawadi", "marunji", "wakad", "tathawade", "punawale", "ravet", "kiwale", "mamurdi", "gahunje", "kasarsai",
    "baner", "balewadi", "mahalunge", "sus", "bavdhan", "pashan", "aundh",
    "pimple saudagar", "pimple gurav", "pimple nilakh", "rahatani", "kalewadi", "thergaon",
    "pimpri", "chinchwad", "akurdi", "nigdi", "pradhikaran", "dehu road",
    "bhosari", "moshi", "chakan", "talegaon", "alandi", "dighi", "charholi", "dapodi", "sangvi",
    "swargate", "swarget", "katraj", "dhayari", "narhe", "sinhagad road", "ambegaon", "vadgaon", "bibwewadi",
    "kondhwa", "undri", "pisoli", "handewadi", "wanowrie", "salunke vihar", "nibm", "camp",
    "shivajinagar", "kothrud", "karve nagar", "erandwane", "deccan", "model colony", "senapati bapat road",
    "kharadi", "viman nagar", "kalyani nagar", "koregaon park", "wadgaon sheri", "keshav nagar",
    "mundhwa", "magarpatta", "hadapsar", "manjri", "phursungi", "shewalewadi",
    "wagholi", "lohegaon", "dhanori", "vishrantwadi", "tingre nagar", "yerwada"
  ];
  const found = [];
  for (const area of commonAreas) {
    const reg = new RegExp(`\\b${area}\\b`, "i");
    if (reg.test(lower)) {
      const fixed = area === "swarget" ? "swargate" : area;
      const formatted = fixed.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!found.includes(formatted)) found.push(formatted);
    }
  }
  return found;
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
  }

  const crMatch = userMessage.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/i);
  const lakhMatch = userMessage.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:l|lakh|lakhs|lac|lacs)/i);
  if (!rangeMatch && !underMatch && !aboveMatch) {
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
    "swarget": "swargate",
    "swargat": "swargate",
    "sawrgate": "swargate",
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
    "swargate", "katraj", "dhayari", "narhe", "sinhagad road", "ambegaon", "vadgaon", "bibwewadi", "padmavati",
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

  // Determine if search should trigger (STRICTLY for buyers and tenants only when explicitly searching)
  const isDashboardQuery =
    lower === "open your dashboard" ||
    lower === "open dashboard" ||
    lower === "my dashboard" ||
    lower === "dashboard" ||
    lower.includes("dashboard");

  const hasSearchIntent =
    !isDashboardQuery &&
    (lower.includes("show") ||
      lower.includes("find") ||
      lower.includes("search") ||
      lower.includes("flats") ||
      lower.includes("flat") ||
      lower.includes("bhk") ||
      lower.includes("properties") ||
      lower.includes("rent in") ||
      lower.includes("buy in"));

  const isKnowledgeQuery = isRealEstateKnowledgeQuery(userMessage);
  let should_search_properties = !isKnowledgeQuery && !isDashboardQuery && (intent === "buyer" || intent === "tenant") && hasSearchIntent;

  // Formulate short, clean response without asterisks or emojis
  const userNameGreeting = profile.name ? ` ${profile.name}` : "";

  // Off-topic / general knowledge check (strict refusal)
  const isOffTopic =
    lower.includes("capital of") ||
    lower.includes("blood type") ||
    lower.includes("blood group") ||
    lower.includes("universal donor") ||
    lower.includes("universal recipient") ||
    lower.includes("prime minister") ||
    lower.includes("president of") ||
    lower.includes("tell me a joke") ||
    lower.includes("write code") ||
    lower.includes("write python") ||
    lower.includes("who is elon") ||
    lower.includes("who won") ||
    lower.includes("how far is the moon") ||
    lower.includes("what is 2+") ||
    lower.includes("universal blood");

  const isExecutiveInquiry =
    lower.includes("contact with executive") ||
    lower.includes("contact executive") ||
    lower.includes("talk to executive") ||
    lower.includes("talk with executive") ||
    lower.includes("connect with executive") ||
    lower.includes("chat with executive") ||
    lower.includes("speak to executive") ||
    lower.includes("talk to agent") ||
    lower.includes("connect with agent");

  const isAdminContactInquiry =
    lower.includes("admin support") ||
    lower.includes("admin contact") ||
    lower.includes("admin number") ||
    lower.includes("contact admin") ||
    lower.includes("general query") ||
    lower.includes("general admin support") ||
    lower.includes("support number") ||
    lower.includes("helpline");

  if (isOffTopic) {
    reply = "I am REX, your dedicated Real Estate AI Consultant at Resale Expert. I specialize exclusively in Pune real estate (buying, selling, renting properties, site visits, and property valuations). How can I assist you with your property requirements today?";
    suggestions = ["Find 2 BHK in Wakad", "Properties in Hinjewadi", "List My Property", "Get Free Property Valuation"];
  } else if (isExecutiveInquiry) {
    reply = "I would be glad to connect you with our team. Could you please let me know the purpose of your request so I can route you to the right specialist?";
    suggestions = ["🏠 Buy Property", "🏷️ Sell Property", "🔑 Rent Property", "📞 General Admin Support"];
  } else if (isAdminContactInquiry) {
    reply = "You can directly reach our Resale Expert Admin & Support team at +91 9637 00 9639 (Email: info@resaleexpert.in). Our office is available Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM. How else can I assist you?";
    suggestions = ["Find 2 BHK in Wakad", "List My Property", "Schedule Site Visit", "Check Resale Valuation"];
  } else if (lower.includes("resale expert") || lower.includes("about company") || lower.includes("brokerage") || lower.includes("charges") || lower.includes("what is resale expert") || lower.includes("what do you do")) {
    reply = "Resale Expert provides 100% managed real estate services in Pune: a dedicated Property Executive for physical verification, key holding, verified buyer matching, legal title search, and registration with transparent pricing and zero spam calls.";
    suggestions = ["Find 2 BHK in Wakad", "List My Property", "Talk to Property Executive", "Check Resale Valuation"];
    should_search_properties = false;
  } else if (lower.includes("rera") || lower.includes("maharera")) {
    reply = `RERA (Real Estate Regulatory Authority) is a statutory authority enacted under the Real Estate Act, 2016 to protect homebuyer interests, ensure market transparency, and enforce timely project completions.\n\nKey provisions in Maharashtra (MahaRERA):\n• Mandatory Registration: Every commercial and residential project over 500 sq. meters or 8 flats must register with MahaRERA before marketing.\n• 70% Escrow Rule: Promoters must deposit 70% of buyer collections into a dedicated project bank account to fund construction exclusively.\n• Standard Carpet Area: Builders are legally required to quote and sell units based on net usable Carpet Area (not super built-up).\n• 5-Year Structural Warranty: Developers are legally liable to rectify structural or quality defects for 5 years after possession.\n• For Resale Properties: Verifying the original MahaRERA registration confirms that the original construction, sanctioned plans, and title history are legally authentic.`;
    suggestions = ["Steps to buy a resale home", "What is earnest money?", "Stamp Duty in Pune", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (
    lower.includes("earnest money") ||
    lower.includes("token money") ||
    lower.includes("token amount") ||
    lower.includes("bayana") ||
    lower.includes("booking amount") ||
    lower.includes("booking token")
  ) {
    reply = `Earnest Money (commonly known as Token Money or Bayana) is an initial financial deposit paid by a buyer to the seller to formally demonstrate serious purchase intent and take the property off the open market.\n\nKey aspects in Pune resale transactions:\n• Typical Amount: Usually ₹50,000 to ₹1 Lakh as an initial booking token, followed by 10% to 20% upon signing the registered Agreement to Sell.\n• Written Receipt: Never transfer token money without a formal 'Token Receipt' or 'Memorandum of Understanding (MOU)' stating the agreed price, payment timeline, and title clearance conditions.\n• Refund Terms: Legitimate token agreements specify that the token is 100% refundable if the property title has legal defects or bank loan is rejected. If the buyer cancels without contractual grounds, the seller may forfeit it.\n• Resale Expert Safety: Our team coordinates all token receipts and escrow handling to protect your funds securely.`;
    suggestions = ["Steps to buy a resale home", "What is RERA", "Legal documents required", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (
    lower.includes("first step in buying") ||
    lower.includes("first step to buy") ||
    lower.includes("first step") ||
    lower.includes("step in buying a home") ||
    lower.includes("steps to buy") ||
    lower.includes("how to buy a house") ||
    lower.includes("how to buy a home") ||
    lower.includes("buying process") ||
    lower.includes("process to buy")
  ) {
    reply = `The first and most critical step in buying a home is **Determining Your Total Budget & Securing Home Loan Pre-Approval**:\n\n1. **Financial Assessment (First Step)**: Calculate your available personal savings for the down payment (15%–20%) plus government taxes (7% stamp duty & registration in Pune, society transfer fees, and legal charges). Get a pre-approved loan letter to know your exact borrowing capacity.\n2. **Identify Micro-Markets**: Choose Pune localities matching your workplace commute and lifestyle (e.g. Wakad/Hinjewadi for IT, Baner/Balewadi for lifestyle, Kharadi for East Pune).\n3. **Property Shortlisting & Inspection**: Compare carpet area, society amenities, age of construction, and market price per sq.ft.\n4. **Legal Due Diligence**: Inspect the 30-year Search Report, original Chain of Title Deeds, Occupancy Certificate (OC), and Society NOC.\n5. **Token Money & Agreement to Sell**: Pay token with a formal receipt and execute the registered Agreement to Sell.\n6. **Bank Loan Disbursal & Final Registration**: Complete biometric registration at the Sub-Registrar Office, pay stamp duty, and take physical possession of keys.\n\nResale Expert provides 100% end-to-end guidance from your first shortlisted flat to key handover!`;
    suggestions = ["What is earnest money?", "What is RERA", "Explore 2 BHK in Wakad", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (
    lower.includes("occupancy certificate") ||
    lower.includes("completion certificate") ||
    lower.includes("what is oc") ||
    lower.includes("what is cc") ||
    lower.includes("oc vs cc")
  ) {
    reply = `Occupancy Certificate (OC) and Completion Certificate (CC) are vital municipal clearances issued by PMC/PCMC in Pune:\n\n• **Completion Certificate (CC)**: Certifies that the developer constructed the building strictly adhering to sanctioned architectural drawings and safety bylaws.\n• **Occupancy Certificate (OC)**: Issued after CC once municipal authorities inspect and verify basic civic infrastructure (water supply, drainage, electricity, elevator fitness, and fire NOC). It declares the building legally habitable.\n• **Why OC is Critical for Resale**: Banks rarely sanction home loans on properties without an OC, and non-OC buildings face double water charges or municipal eviction notices. Always insist on an OC before buying!`;
    suggestions = ["Legal documents required", "What is RERA", "Steps to buy a home", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (
    lower.includes("carpet area") ||
    lower.includes("built up area") ||
    lower.includes("super built") ||
    lower.includes("difference between carpet")
  ) {
    reply = `Key differences in property area measurements:\n\n• **Carpet Area**: The actual net usable floor space inside the apartment's interior walls (where a carpet can be laid). Under MahaRERA, flat prices and sale deeds must be calculated strictly on Carpet Area.\n• **Built-Up Area**: Carpet area + thickness of inner and outer walls + balcony/terrace space (typically 10%–15% larger than carpet area).\n• **Super Built-Up Area**: Built-up area + proportionate share of common society areas (lobby, lifts, staircases, clubhouse, security cabin). Typically 25%–35% higher than carpet area.\n\nPro-Tip: When comparing resale flats in Pune, always calculate the rate per square foot using the **RERA Carpet Area** for a true price comparison.`;
    suggestions = ["Resale flat prices in Pune", "What is RERA", "Steps to buy a home", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (
    lower.includes("home loan") ||
    lower.includes("loan eligibility") ||
    lower.includes("cibil") ||
    lower.includes("interest rate") ||
    lower.includes("pre approval") ||
    lower.includes("loan process")
  ) {
    reply = `Home Loan Guide for Pune Resale Properties:\n\n• Loan-to-Value (LTV): Leading banks fund up to 75% to 80% of the market property agreement value (excluding taxes).\n• Interest Rates: Current rates range between 8.35% – 9.15% p.a. depending on your CIBIL score (ideal: 750+).\n• Tenure: Flexible repayment up to 20 to 30 years.\n• Required Documents: 3 months salary slips, 6 months bank account statements, 2-3 years Form 16 / ITR, plus complete property title documents for bank legal and technical appraisal.\n• Bank Tie-ups: Resale Expert partners directly with HDFC, SBI, ICICI, and Axis Bank to expedite doorstep sanction with minimal paperwork.`;
    suggestions = ["Steps to buy a home", "What is earnest money?", "Stamp Duty in Pune", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (
    lower.includes("encumbrance") ||
    lower.includes("title deed") ||
    lower.includes("title search") ||
    lower.includes("legal documents") ||
    lower.includes("resale document") ||
    lower.includes("documents required") ||
    lower.includes("search report")
  ) {
    reply = `Essential Legal Documents Required for Resale Flat Purchase in Pune:\n\n1. **Chain of Title Deeds**: Every registered Sale Deed and Agreement from the initial developer handover down to the current owner.\n2. **Occupancy Certificate (OC)** & Sanctioned Building Blueprint from PMC/PCMC.\n3. **30-Year Title Search Report & Encumbrance Certificate (EC)**: Confirms no ongoing litigation, mortgage, or financial attachment.\n4. **Society NOC & Original Share Certificate**: Confirms zero maintenance arrears and transfers official society membership.\n5. **Latest Property Tax Receipts & Electricity Bill** in the seller's name.\n\nResale Expert performs rigorous 30-year legal verification on all listings before registration.`;
    suggestions = ["What is earnest money?", "What is RERA", "Steps to buy a home", "Talk to Property Executive"];
    should_search_properties = false;
  } else if (lower.includes("stamp duty") || lower.includes("registration charge") || lower.includes("govt fee") || lower.includes("tax")) {
    reply = "In Pune (Maharashtra), stamp duty is 7% (6% for female owners) and the registration fee is 1% (capped at ₹30,000). Our team assists with complete legal verification and agreement registration.";
    suggestions = ["Find 2 BHK in Wakad", "Talk to Property Executive", "Get Free Property Valuation"];
  } else if (lower.includes("rent agreement") || lower.includes("lease agreement") || lower.includes("deposit") || lower.includes("lock-in") || lower.includes("rental rules") || lower.includes("agreement rules") || lower.includes("agreement")) {
    reply = "In Pune (Maharashtra), residential rent agreements are registered as Leave and License for 11 months with biometric verification and police intimation. Standard refundable security deposit is 2 to 3 months rent with a 1-month notice period.";
    suggestions = ["Rent in Baner", "Rent in Wakad", "Explore Rental Listings", "Talk to Property Executive"];
  } else if (
    (lower.includes("market rent") || lower.includes("rent for") || lower.includes("rental rate") || lower.includes("average rent") || lower.includes("how much rent") || (lower.includes("rent") && (lower.includes("1bhk") || lower.includes("2bhk") || lower.includes("3bhk") || lower.includes("bhk")))) &&
    !lower.includes("agreement") && !lower.includes("rules") && !lower.includes("deposit")
  ) {
    const loc = newlyMentionedLocs[0] || (lower.includes("swarget") || lower.includes("swargate") ? "Swargate" : "Pune");
    const bhk = reqs.unit_type || (lower.includes("1bhk") || lower.includes("1 bhk") ? "1 BHK" : (lower.includes("2bhk") || lower.includes("2 bhk") ? "2 BHK" : (lower.includes("3bhk") || lower.includes("3 bhk") ? "3 BHK" : "1 BHK")));

    let rentRange = "₹12,000 to ₹16,000";
    const locLow = loc.toLowerCase();
    if (bhk.includes("1")) {
      if (locLow.includes("baner") || locLow.includes("viman")) rentRange = "₹16,000 to ₹22,000";
      else if (locLow.includes("wakad") || locLow.includes("hinjewadi")) rentRange = "₹14,000 to ₹19,000";
      else if (locLow.includes("swargate") || locLow.includes("kothrud")) rentRange = "₹12,000 to ₹16,000";
      else rentRange = "₹12,000 to ₹16,000";
    } else if (bhk.includes("2")) {
      if (locLow.includes("baner") || locLow.includes("viman")) rentRange = "₹28,000 to ₹38,000";
      else if (locLow.includes("wakad") || locLow.includes("hinjewadi") || locLow.includes("kharadi")) rentRange = "₹24,000 to ₹32,000";
      else if (locLow.includes("swargate") || locLow.includes("kothrud")) rentRange = "₹20,000 to ₹28,000";
      else rentRange = "₹22,000 to ₹28,000";
    } else if (bhk.includes("3")) {
      rentRange = "₹35,000 to ₹55,000";
    }

    reply = `In ${loc}, Pune, the current market rent for a ${bhk} typically ranges between ${rentRange} per month for unfurnished to semi-furnished flats. Fully furnished units in modern gated societies near transit points (like Swargate Metro / IT hubs) can range slightly higher. Would you like to view verified rental properties in this area?`;
    suggestions = [`Rent in ${loc}`, "Explore Pune Rentals", "Rent Agreement Rules", "Modify Rental Filters"];
    intent = "tenant";
    should_search_properties = false;
  } else if (intent === "tenant") {
    if (reqs.locations.length > 0 || reqs.bedrooms || reqs.budget_max) {
      reply = `Searching verified rental properties in ${reqs.locations.join(", ") || "Pune"} matching your criteria...`;
      suggestions = ["Contact Owner", "Explore Nearby Rentals", "Rent in Baner", "Modify Rental Filters"];
    } else {
      reply = `Looking for a rental home in Pune? Which locality (e.g. Wakad, Baner, Hinjewadi), BHK type, and monthly rental budget are you considering?`;
      suggestions = ["Rent in Baner", "Rent in Wakad", "Rent in Hinjewadi", "Rent Agreement Rules"];
    }
  } else if (intent === "seller") {
    if (lower.includes("valuation") || lower.includes("market rate") || lower.includes("estimate") || lower.includes("price")) {
      reply = `Our automated Pune valuation model estimates market rates between ₹6,200 – ₹9,800/sq.ft. Typical 1.5 BHK resale range is ₹38L–₹48L, and 2 BHK is ₹55L–₹78L. Our dedicated Property Executive can provide a comprehensive on-site valuation.`;
      suggestions = ["Talk to Property Executive", "Check Active Buyers in My Locality", "Check Listing Status", "List Another Property"];
    } else if (lower.includes("active buyers") || lower.includes("buyers")) {
      reply = `We currently have over 380+ active verified buyers seeking 1, 1.5, 2 & 3 BHK resale flats across Wakad, Punawale, Hinjewadi, and Baner with budgets from ₹38L to ₹1.2 Cr.`;
      suggestions = ["Talk to Property Executive", "Get Free Property Valuation", "Check Listing Status", "List Another Property"];
    } else if (lower.includes("status") || lower.includes("listing status")) {
      reply = `Your property listing is currently under review by our operations team and will be assigned to your dedicated Property Executive for physical verification and buyer matching.`;
      suggestions = ["Talk to Property Executive", "Check Active Buyers in My Locality", "Get Free Property Valuation", "List Another Property"];
    } else if (lower.includes("executive") || lower.includes("contact") || lower.includes("call")) {
      reply = `Our dedicated Property Executives provide 100% managed resale: physical inspection, document verification, professional photography, and verified buyer visits. You can reach our team at +91 9637 00 9639 or support@resaleexpert.in.`;
      suggestions = ["Check Active Buyers in My Locality", "Get Free Property Valuation", "Check Listing Status", "List Another Property"];
    } else {
      reply = `Resale Expert provides 100% managed resale services with a dedicated executive, verified buyer matching, and zero spam calls. Please provide your property details below:`;
      suggestions = ["Check Active Buyers in My Locality", "Get Free Property Valuation", "Talk to Property Executive"];
    }
  } else if (
    lower.includes("which location") ||
    lower.includes("on which location") ||
    lower.includes("where to buy") ||
    lower.includes("where should i buy") ||
    lower.includes("best location") ||
    lower.includes("best area") ||
    lower.includes("popular localities") ||
    lower.includes("explore popular") ||
    lower.includes("location i need") ||
    lower.includes("locality i need") ||
    lower.includes("where to invest") ||
    lower.includes("which area") ||
    lower.includes("which place")
  ) {
    reply = `Pune offers top micro-markets tailored to distinct buyer requirements:

1. **Wakad & Hinjewadi**: Ideal for IT professionals working in Rajiv Gandhi Infotech Park. Excellent connectivity, top schools, high rental yield (4.5%–5.5%), and strong appreciation. 2 BHK resale: ₹55 Lakh – ₹85 Lakh.
2. **Baner & Balewadi**: Premium residential and lifestyle corridor with Balewadi High Street, close to Mumbai-Pune Highway and Aundh. 2 BHK resale: ₹75 Lakh – ₹1.25 Cr.
3. **Ravet & Punawale**: Fastest-growing budget and mid-segment corridors in PCMC near Expressway, offering great long-term ROI. 2 BHK resale: ₹45 Lakh – ₹65 Lakh.
4. **Kharadi & Viman Nagar**: Prime East Pune IT hub near EON IT Park and World Trade Center. 2 BHK resale: ₹65 Lakh – ₹1.1 Cr.

Are you looking for self-use (commute & lifestyle) or investment (rental yield & appreciation)?`;
    suggestions = ["2 BHK in Wakad", "2 BHK in Baner", "Check Resale Prices", "Talk to Property Executive"];
    intent = "general";
    should_search_properties = false;
  } else if (
    lower.includes("resale flat prices") ||
    lower.includes("check resale") ||
    lower.includes("resale prices") ||
    lower.includes("flat prices") ||
    lower.includes("market insights") ||
    lower.includes("market insight") ||
    lower.includes("average resale") ||
    lower.includes("average price") ||
    lower.includes("rate per sq")
  ) {
    reply = `Here is the current resale flat pricing benchmark in Pune:

• **1 BHK**: ₹32 Lakh – ₹48 Lakh
• **2 BHK**: ₹52 Lakh – ₹85 Lakh
• **3 BHK**: ₹85 Lakh – ₹1.6 Cr

**Average Rates per sq.ft**:
- West Pune (Wakad, Punawale, Tathawade): ₹6,200 – ₹8,500/sq.ft
- Baner, Balewadi & Aundh: ₹8,500 – ₹12,500/sq.ft
- East Pune (Kharadi): ₹7,500 – ₹10,800/sq.ft

Annual capital appreciation in major IT corridors averages 7% to 9.5%. Would you like to explore listings in any specific area?`;
    suggestions = ["Explore Popular Localities", "Properties in Wakad", "Properties in Baner", "Talk to Property Executive"];
    intent = "general";
    should_search_properties = false;
  } else if (isDashboardQuery) {
    should_search_properties = false;
    if (intent === "owner" || profile.role === "owner" || lower.includes("owner")) {
      reply = `You can review matching tenant inquiries, move-in timelines, and contact details directly in your Owner Portal.`;
      suggestions = ["List Another Rental Property", "Check Interested Tenants", "Talk to Sales Executive", "Rental Agreement Rules"];
      intent = "owner";
    } else if (intent === "seller" || profile.role === "seller" || lower.includes("seller")) {
      reply = `You can review active buyer leads, scheduled executive visits, and check listing verification status directly in your Seller Dashboard.`;
      suggestions = ["Check Active Buyers in My Locality", "Get Free Property Valuation", "Talk to Property Executive"];
      intent = "seller";
    } else if (intent === "tenant" || profile.role === "tenant" || lower.includes("tenant")) {
      reply = `You can view your shortlisted rental flats, scheduled visit dates, and assigned rental executive details in your Tenant Portal.`;
      suggestions = ["Rent in Baner", "Rent in Wakad", "Explore Rental Listings", "Talk to Executive"];
      intent = "tenant";
    } else {
      reply = `You can open your Dashboard to check your saved properties, scheduled visits, and executive communications.`;
      suggestions = ["Explore 2 BHK in Pune", "Book Site Visit", "Talk to Executive"];
    }
  } else if (
    lower.includes("agreement rules") ||
    lower.includes("rental agreement rules") ||
    lower.includes("rental rules") ||
    lower === "rental agreement"
  ) {
    should_search_properties = false;
    reply = `Key Maharashtra Rental Agreement (Leave & License) Rules for Owners:\n\n• Mandatory Online Registration: As per the Maharashtra Rent Control Act, 1999, all rental agreements must be officially registered.\n• Biometric Verification: Both Owner and Tenant must undergo Aadhaar-based biometric e-registration. Our executive assists at your doorstep.\n• Standard Tenure: Typical agreements are drafted for 11 months with an optional renewal and standard 30-day notice clause.\n• Police Intimation: Submission of tenant verification details to the local Pune police station is legally required and coordinated by our team.\n• Security Deposit: Standard deposit in Pune is 2 to 3 months of rent, held securely until move-out inspection.`;
    suggestions = ["Open Your Dashboard", "List Another Rental Property", "Talk to Sales Executive", "Check Interested Tenants"];
    intent = "owner";
  } else if (
    lower.includes("interested tenant") ||
    lower.includes("tenant demand") ||
    lower.includes("check interested") ||
    lower.includes("track interested")
  ) {
    reply = `Our rental assistance desk actively tracks verified tenants looking for homes across Pune. Our team pre-screens tenants with background checks and biometric Leave & License agreements. You can view matching tenant leads directly in your Owner Portal or speak with your assigned executive for visit schedules.`;
    suggestions = ["Open Your Dashboard", "List Another Rental Property", "Talk to Sales Executive", "Rental Agreement Rules"];
    intent = "owner";
    should_search_properties = false;
  } else if (
    lower.includes("add my property for rent") ||
    lower.includes("give flat on rent") ||
    lower.includes("give my flat on rent") ||
    lower.includes("give property on rent") ||
    lower.includes("give on rent") ||
    lower.includes("rent out") ||
    lower.includes("rent my flat") ||
    lower.includes("rent my property") ||
    lower.includes("find tenant") ||
    lower.includes("get tenant") ||
    lower.includes("kiraye pe") ||
    lower.includes("bhade pe") ||
    lower.includes("bhadya ne") ||
    lower.includes("list property for rent") ||
    lower.includes("list my property for rent") ||
    lower.includes("post property for rent") ||
    lower.includes("owner rental")
  ) {
    reply = `Welcome to Resale Expert! We offer 100% managed rental services for property owners: tenant verification, biometric Leave & License agreement, police intimation, and dedicated Sales Executive support. Please complete your rental property details below:`;
    suggestions = ["List Property for Rent", "Rental Agreement Rules", "Check Tenant Demand", "Talk to Sales Executive"];
    intent = "owner";
    should_search_properties = false;
  } else if (
    lower.includes("broker") ||
    lower.includes("channel partner") ||
    lower.includes("agent tie up") ||
    lower.includes("cp registration") ||
    lower.includes("brokerage") ||
    lower.includes("commission") ||
    lower.includes("i am an agent") ||
    lower.includes("i am agent")
  ) {
    reply = `Welcome to the Resale Expert Channel Partner Network! We collaborate with top real estate agents, brokers, and channel partners across Pune. We offer verified inventory access, high commission slabs, a dedicated partner manager, and prompt deal closures.`;
    suggestions = ["Channel Partner Registration", "Commission Structure", "Inventory Sharing", "Talk to Partner Desk"];
    intent = "broker";
    should_search_properties = false;
  } else if (
    lower.includes("talk to sales executive") ||
    lower.includes("talk to property executive") ||
    lower.includes("talk to executive") ||
    lower.includes("connect with executive") ||
    lower.includes("contact executive")
  ) {
    should_search_properties = false;
    if (intent === "owner" || profile.role === "owner") {
      reply = `You are connected with our Dedicated Owner Assistance Desk:\n\n• Dedicated Desk: Landlord & Rental Assistance Team\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Tenant screening, biometric Leave & License agreement, police intimation, and dedicated rent coordination.\n\nYou can chat, call, or reach us on WhatsApp directly!`;
      suggestions = ["Open Your Dashboard", "Check Interested Tenants", "List Another Rental Property", "Rental Agreement Rules"];
      intent = "owner";
    } else if (intent === "tenant" || profile.role === "tenant") {
      reply = `You are connected with our Dedicated Rental Assistance Desk:\n\n• Dedicated Rental Desk: Tenant Support Team\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Owner contact details, physical flat verification, rental agreement drafting, and move-in coordination.\n\nYou can chat, call, or reach us on WhatsApp directly!`;
      suggestions = ["Rent in Baner", "Rent in Wakad", "Explore Rental Listings", "Modify Filters"];
      intent = "tenant";
    } else if (intent === "broker" || profile.role === "broker") {
      reply = `You are connected with our Dedicated Channel Partner & Broker Desk:\n\n• Partnership Desk: B2B Channel Partner Relations\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Certified inventory sharing, commission slab transparency, site visit coordination for your clients, and prompt deal closures.`;
      suggestions = ["Channel Partner Registration", "Commission Structure", "Inventory Sharing", "Talk to Partner Desk"];
      intent = "broker";
    } else {
      reply = `You are connected with our Dedicated Property Executive Team:\n\n• Direct Phone / WhatsApp: +91 9637 00 9639\n• Email: info@resaleexpert.in\n• Office Hours: Mon - Fri: 9:00 AM - 8:00 PM | Sat - Sun: 9:00 AM - 9:00 PM\n• Assistance: Verified site visits, valuation checks, key holding, and closing documentation.`;
      suggestions = ["Check Active Buyers in My Locality", "Get Free Property Valuation", "Check Listing Status", "List Another Property"];
      intent = "seller";
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

  const isQuestionOrAdvice =
    lower.includes("?") ||
    lower.includes("which") ||
    lower.includes("where") ||
    lower.includes("how") ||
    lower.includes("what") ||
    lower.includes("why") ||
    lower.includes("recommend") ||
    lower.includes("best") ||
    lower.includes("suggest") ||
    lower.includes("price") ||
    lower.includes("rate") ||
    lower.includes("cost") ||
    lower.includes("insight") ||
    lower.includes("trend") ||
    lower.includes("location");

  const isExplicitOpenBuy =
    lower === "buy" ||
    lower === "buy property" ||
    lower === "🏠 buy property" ||
    lower === "i want to buy flat" ||
    lower === "i want to buy property" ||
    lower === "looking to buy";

  const show_buyer_filter = Boolean(
    !isKnowledgeQuery &&
    !isQuestionOrAdvice &&
    intent === "buyer" &&
    isExplicitOpenBuy &&
    !should_search_properties &&
    (!reqs.locations || reqs.locations.length === 0) &&
    !reqs.bedrooms &&
    !reqs.budget_max
  );

  const isGenericRentPrompt =
    (intent === "tenant" || profile.role === "tenant") &&
    !should_search_properties &&
    (!reqs.locations || reqs.locations.length === 0) &&
    !reqs.bedrooms &&
    !reqs.budget_max;

  const show_tenant_filter = Boolean(
    isGenericRentPrompt &&
    (lower.includes("search rental home") ||
      lower.includes("rent property") ||
      lower.includes("rent flat") ||
      lower.includes("flat for rent") ||
      lower.includes("want to rent") ||
      lower.includes("looking for rent") ||
      lower.includes("modify rental filter") ||
      lower === "rent")
  );

  const isExplicitSellOrListRequest =
    lower.includes("sell") ||
    lower.includes("list") ||
    lower.includes("listing") ||
    lower.includes("bechna");

  const isSellerNonFormInquiry =
    lower.includes("active buyers") ||
    lower.includes("valuation") ||
    lower.includes("market rate") ||
    lower.includes("status") ||
    lower.includes("executive") ||
    lower.includes("contact");

  const show_seller_wizard = Boolean(intent === "seller" && isExplicitSellOrListRequest && !isSellerNonFormInquiry);

  const isOwnerNonFormInquiry =
    lower.includes("interested tenant") ||
    lower.includes("tenant demand") ||
    lower.includes("active tenant") ||
    lower.includes("agreement rules") ||
    lower.includes("rental agreement") ||
    lower.includes("status") ||
    lower.includes("executive") ||
    lower.includes("contact") ||
    lower.includes("dashboard") ||
    lower.includes("portal") ||
    lower.includes("rule") ||
    lower.includes("rate") ||
    lower.includes("price") ||
    lower.includes("yield");

  const isExplicitOwnerListRequest =
    lower.includes("list property for rent") ||
    lower.includes("list another rental property") ||
    lower.includes("list my property for rent") ||
    lower.includes("post property for rent") ||
    lower.includes("add my property for rent") ||
    lower.includes("add property for rent") ||
    lower.includes("give flat on rent") ||
    lower.includes("give my flat on rent") ||
    lower.includes("give property on rent") ||
    lower.includes("give on rent") ||
    lower.includes("rent out") ||
    lower.includes("rent my flat") ||
    lower.includes("rent my property") ||
    lower.includes("kiraye pe") ||
    lower.includes("bhade pe") ||
    lower.includes("bhadya ne");

  const show_owner_wizard = Boolean(intent === "owner" && isExplicitOwnerListRequest && !isOwnerNonFormInquiry);

  const is_qualified = Boolean(
    (profile.phone || profile.email) &&
    (reqs.locations?.length > 0 || reqs.budget_max || reqs.bedrooms)
  );

  return {
    reply,
    suggestions,
    intent,
    should_search_properties,
    show_buyer_filter,
    show_tenant_filter,
    show_owner_wizard,
    show_seller_wizard,
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

    // Guarantee locality extraction if text contains known Pune localities
    const extractedLocs = extractLocationsFromText(userMessage);
    if (extractedLocs.length > 0) {
      finalReqs.locations = extractedLocs;
    }

    // Extract BHK if present in user message
    const bhkMatch = userMessage.match(/\b(\d+(?:\.\d+)?)\s*(?:bhk|bedroom|bed)\b/i);
    if (bhkMatch) {
      finalReqs.bedrooms = parseFloat(bhkMatch[1]);
      finalReqs.unit_type = `${bhkMatch[1]} BHK`;
    }

    // Extract rent budget if present in user message (e.g. under 25k, 18000)
    const rentBudgetMatch = userMessage.match(/(?:under|below|upto|budget|around|within|max)?\s*(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:k|thousand)/i);
    if (rentBudgetMatch) {
      finalReqs.budget_max = parseInt(rentBudgetMatch[1], 10) * 1000;
    }

    const isKnowledgeQuery = isRealEstateKnowledgeQuery(userMessage);

    let should_search = false;
    if (!isKnowledgeQuery) {
      if (finalReqs.locations?.length > 0 || finalReqs.bedrooms != null || finalReqs.budget_max != null) {
        should_search = true;
      } else if (parsed.should_search_properties !== undefined) {
        should_search = Boolean(parsed.should_search_properties);
      } else {
        should_search = Boolean(
          (parsed.intent === "buyer" || parsed.intent === "tenant") &&
          (finalReqs.locations?.length > 0 || finalReqs.budget_max != null || finalReqs.bedrooms != null)
        );
      }
    }

    const lowerMsg = (userMessage || "").toLowerCase().trim();

    const isQuestionOrAdvice =
      lowerMsg.includes("?") ||
      lowerMsg.includes("which") ||
      lowerMsg.includes("where") ||
      lowerMsg.includes("how") ||
      lowerMsg.includes("what") ||
      lowerMsg.includes("why") ||
      lowerMsg.includes("recommend") ||
      lowerMsg.includes("best") ||
      lowerMsg.includes("suggest") ||
      lowerMsg.includes("price") ||
      lowerMsg.includes("rate") ||
      lowerMsg.includes("cost") ||
      lowerMsg.includes("insight") ||
      lowerMsg.includes("trend") ||
      lowerMsg.includes("location");

    const isExplicitOpenBuy =
      lowerMsg === "buy" ||
      lowerMsg === "buy property" ||
      lowerMsg === "🏠 buy property" ||
      lowerMsg === "i want to buy flat" ||
      lowerMsg === "i want to buy property" ||
      lowerMsg === "looking to buy";

    const show_buyer_filter = Boolean(
      !isKnowledgeQuery &&
      !isQuestionOrAdvice &&
      (parsed.show_buyer_filter ||
        (!should_search &&
          (parsed.intent === "buyer" || finalProfile.role === "buyer") &&
          isExplicitOpenBuy &&
          (!finalReqs.locations || finalReqs.locations.length === 0) &&
          !finalReqs.bedrooms &&
          !finalReqs.budget_max))
    );

    const isRentalKnowledge =
      lowerMsg.includes("agreement") ||
      lowerMsg.includes("rule") ||
      lowerMsg.includes("process") ||
      lowerMsg.includes("guideline") ||
      lowerMsg.includes("stamp duty") ||
      lowerMsg.includes("deposit") ||
      lowerMsg.includes("notice period") ||
      lowerMsg.includes("police verification") ||
      isKnowledgeQuery;

    const isExplicitRentalSearchPrompt =
      lowerMsg.includes("search rental") ||
      lowerMsg.includes("rent flat") ||
      lowerMsg.includes("rent home") ||
      lowerMsg.includes("want to rent") ||
      lowerMsg.includes("looking for rent") ||
      lowerMsg.includes("modify rental filter") ||
      lowerMsg === "rent" ||
      lowerMsg === "rentals";

    const show_tenant_filter = Boolean(
      !isRentalKnowledge &&
      (parsed.show_tenant_filter ||
        (!should_search && (parsed.intent === "tenant" || finalProfile.role === "tenant") &&
         (!finalReqs.locations || finalReqs.locations.length === 0) &&
         !finalReqs.bedrooms &&
         !finalReqs.budget_max &&
         isExplicitRentalSearchPrompt))
    );

    const isExplicitOwnerListRequest =
      lowerMsg.includes("list property for rent") ||
      lowerMsg.includes("list another rental property") ||
      lowerMsg.includes("list my property for rent") ||
      lowerMsg.includes("post property for rent") ||
      lowerMsg.includes("add my property for rent") ||
      lowerMsg.includes("add property for rent") ||
      lowerMsg.includes("give flat on rent") ||
      lowerMsg.includes("give my flat on rent") ||
      lowerMsg.includes("give property on rent") ||
      lowerMsg.includes("give on rent") ||
      lowerMsg.includes("rent out") ||
      lowerMsg.includes("rent my flat") ||
      lowerMsg.includes("rent my property");

    const isOwnerNonFormInquiry =
      lowerMsg.includes("interested tenant") ||
      lowerMsg.includes("tenant demand") ||
      lowerMsg.includes("active tenant") ||
      lowerMsg.includes("agreement rules") ||
      lowerMsg.includes("rental agreement") ||
      lowerMsg.includes("status") ||
      lowerMsg.includes("executive") ||
      lowerMsg.includes("contact") ||
      lowerMsg.includes("dashboard") ||
      lowerMsg.includes("portal") ||
      lowerMsg.includes("help");

    const show_owner_wizard = Boolean(
      (parsed.show_owner_wizard || isExplicitOwnerListRequest) &&
      !isOwnerNonFormInquiry
    );

    const defaultSuggestions =
      (finalProfile.role === "seller" || parsed.intent === "seller")
        ? ["Sell Your Property", "Check Property Value", "Seller Support", "Talk to Executive"]
        : (finalProfile.role === "owner" || parsed.intent === "owner")
        ? ["List Property for Rent", "Check Tenant Demand", "Rental Agreement Rules", "Talk to Executive"]
        : (finalProfile.role === "tenant" || parsed.intent === "tenant")
        ? ["Rent in Baner", "Rent in Wakad", "Explore Rental Listings", "Rent Agreement Rules"]
        : ["Explore 2 BHK in Wakad", "Properties in Baner", "Check Resale Prices", "Talk to Executive"];

    return {
      reply: parsed.reply || "I'm here to assist you with your real estate needs. Could you tell me more about your requirements?",
      suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0 ? parsed.suggestions : defaultSuggestions,
      intent: parsed.intent || finalProfile.role || "buyer",
      should_search_properties: should_search,
      show_buyer_filter,
      show_tenant_filter,
      show_owner_wizard,
      show_seller_wizard: Boolean(parsed.show_seller_wizard),
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
  clientRole = "buyer",
  propertyTitle = "this property",
  propertyLocation = "Pune",
  propertyPrice = "",
  lastClientMessage = "",
  conversationHistory = [],
}) => {
  const isSeller =
    clientRole === "buyer" || clientRole === "tenant"
      ? false
      : clientRole === "seller" ||
        clientRole === "owner" ||
        String(lastClientMessage || "").toLowerCase().startsWith("new seller listing") ||
        String(lastClientMessage || "").toLowerCase().startsWith("new owner rental");

  const openAiConfig = await getOpenAiConfig();

  if (openAiConfig && openAiConfig.apiKey) {
    try {
      const roleDescription = isSeller
        ? "SELLER / PROPERTY OWNER who listed their property for sale/resale. Suggestions must focus on: 1) Acknowledging listing & dedicated executive assignment, 2) Scheduling physical inspection / verified photoshoot, 3) Document verification (Index II, property tax), 4) Pricing / valuation strategy and active buyer demand."
        : "BUYER / INQUIRER interested in purchasing or visiting the property. Suggestions must focus on: 1) Scheduling on-site visit slot, 2) Sharing floor plan & price breakdown, 3) Location/landmark directions, 4) Quick 2-minute discovery call.";

      const messagesPrompt = [
        {
          role: "system",
          content: `You are an expert Real Estate Sales & Relationship Manager AI Assistant for Resale Expert.
Your task is to generate 3 to 4 short, professional, highly contextual, and actionable reply options for the Property Executive to send to the client.

Client Role: ${isSeller ? "SELLER" : "BUYER"}
Property Title: ${propertyTitle}
Location: ${propertyLocation}
Price: ${propertyPrice || "Market Rate"}
Client Name: ${clientName} (${clientFirst})

Role Focus:
${roleDescription}

Guidelines:
1. Keep each reply natural, warm, respectful, and concise (1-2 sentences).
2. Return ONLY valid JSON with this structure:
{
  "suggestions": [
    {
      "id": "reply_1",
      "label": "Short Tag (2-3 words)",
      "category": "${isSeller ? "inspection" : "visit"}",
      "reply_text": "Complete reply message text formatted ready to send"
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
          content: `Latest Client Message: "${lastClientMessage || (isSeller ? `New seller listing for ${propertyTitle}` : `Hi, I am interested in ${propertyTitle}`)}". Please generate 4 smart reply suggestions for the property executive.`,
        },
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: openAiConfig.model || "gpt-4o-mini",
          messages: messagesPrompt,
          temperature: 0.7,
          response_format: { type: "json_object" },
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const contentStr = data.choices?.[0]?.message?.content;
        if (contentStr) {
          const parsed = JSON.parse(contentStr);
          if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
            return parsed.suggestions;
          }
        }
      }
    } catch (llmErr) {
      console.warn("LLM smart replies fallback notice:", llmErr.message);
    }
  }

  // Dynamic Rule-Based Smart Reply Generator
  const cleanMsg = String(lastClientMessage || "").toLowerCase();
  const suggestions = [];

  if (isSeller) {
    // Seller Context Replies
    if (
      cleanMsg.includes("inspect") ||
      cleanMsg.includes("visit") ||
      cleanMsg.includes("photo") ||
      cleanMsg.includes("key") ||
      cleanMsg.includes("time")
    ) {
      suggestions.push({
        id: "seller_inspect_time",
        label: "Schedule Inspection Slot",
        category: "inspection",
        reply_text: `Hello ${clientFirst}! I would like to schedule a 15-minute physical inspection of ${propertyTitle} for photo verification and keys. When is a convenient time for you?`,
      });
    } else if (
      cleanMsg.includes("doc") ||
      cleanMsg.includes("index") ||
      cleanMsg.includes("legal") ||
      cleanMsg.includes("paper")
    ) {
      suggestions.push({
        id: "seller_docs_req",
        label: "Request Index II / Docs",
        category: "verification",
        reply_text: `Hello ${clientFirst}, please share a soft copy of Index II or property tax receipt so our legal desk can complete verification and publish your property live.`,
      });
    } else if (
      cleanMsg.includes("price") ||
      cleanMsg.includes("valuation") ||
      cleanMsg.includes("buyer") ||
      cleanMsg.includes("demand")
    ) {
      suggestions.push({
        id: "seller_price_strat",
        label: "Discuss Price & Demand",
        category: "pricing",
        reply_text: `Regarding ${propertyTitle} (${propertyPrice || "your expected price"}), we currently have high buyer interest in ${propertyLocation}. Let's discuss pricing strategy and expected timelines.`,
      });
    }

    if (suggestions.length < 4) {
      suggestions.push({
        id: "seller_welcome_assigned",
        label: "Acknowledge & Welcome",
        category: "general",
        reply_text: `Hello ${clientFirst}! I am your dedicated Property Executive for ${propertyTitle}. I have reviewed your submission and will be assisting you throughout the resale process.`,
      });
    }
    if (suggestions.length < 4) {
      suggestions.push({
        id: "seller_schedule_inspection",
        label: "Schedule Property Inspection",
        category: "inspection",
        reply_text: `Hello ${clientFirst}, would you be available for a quick property inspection at ${propertyTitle} this week so we can verify details and start matching active buyers?`,
      });
    }
    if (suggestions.length < 4) {
      suggestions.push({
        id: "seller_call_discuss",
        label: "Request 2-Min Call",
        category: "call",
        reply_text: `Hello ${clientFirst}, may I know the best time to call you for a quick 2-minute discussion regarding your property listing at ${propertyTitle}?`,
      });
    }
    if (suggestions.length < 4) {
      suggestions.push({
        id: "seller_doc_verify",
        label: "Document Verification",
        category: "verification",
        reply_text: `To mark ${propertyTitle} as 100% Verified and attract serious buyers, please keep your Index II / ownership documents ready for physical or online check.`,
      });
    }

    return suggestions.slice(0, 4);
  }

  // Buyer Context Replies
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

  // Always include standard high-converting executive options for buyers
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
