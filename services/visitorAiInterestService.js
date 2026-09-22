// backend/services/visitorAiInterestService.js
const db = require('../config/database');
const Integration = require('../models/integration.model');

/**
 * Helper: Retrieve active OpenAI configuration from Settings -> Integrations (DB)
 */
async function getAiConfig() {
  try {
    const chatgptIntegration = await Integration.getByTab('chatgpt');
    if (
      chatgptIntegration &&
      chatgptIntegration.is_active &&
      chatgptIntegration.config &&
      chatgptIntegration.config.api_key &&
      chatgptIntegration.config.api_key.trim()
    ) {
      return {
        apiKey: chatgptIntegration.config.api_key.trim(),
        model: chatgptIntegration.config.model || 'gpt-4o-mini',
      };
    }
  } catch (err) {
    console.warn('Could not fetch OpenAI integration from DB:', err.message);
  }

  // Fallback to process.env if available
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return {
      apiKey: process.env.OPENAI_API_KEY.trim(),
      model: process.env.AI_DEFAULT_MODEL || 'gpt-4o-mini',
    };
  }

  return null;
}

/**
 * Currency Formatter (INR)
 */
function formatInr(num) {
  if (!num || isNaN(Number(num))) return '';
  const val = Number(num);
  if (val >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)} Cr`;
  }
  if (val >= 100000) {
    return `₹${(val / 100000).toFixed(2)} Lakh`;
  }
  return `₹${val.toLocaleString('en-IN')}`;
}

/**
 * Safe JSON parser
 */
function parsePayloadSafe(payload) {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

/**
 * Normalize and determine exact lead/visitor persona
 */
function resolvePersona(exactRole, source, events = []) {
  const r = String(exactRole || source || '').toLowerCase();
  if (r.includes('buyer')) return 'BUYER';
  if (r.includes('seller')) return 'SELLER';
  if (r.includes('owner') || r.includes('landlord')) return 'OWNER';
  if (r.includes('tenant')) return 'TENANT';
  if (r.includes('broker') || r.includes('partner')) return 'BROKER';

  // Infer from events if anonymous/website visitor
  let rentEvents = 0;
  let buyEvents = 0;
  let sellEvents = 0;
  let ownerEvents = 0;

  for (const ev of events) {
    const name = String(ev.event_name || '').toLowerCase();
    const url = String(ev.page_url || '').toLowerCase();
    const payload = parsePayloadSafe(ev.payload);
    const transType = String(payload?.transaction_type || '').toLowerCase();

    if (transType === 'rent' || url.includes('/rent') || name.includes('rent')) rentEvents++;
    if (transType === 'buy' || url.includes('/buy') || url.includes('/property') || name.includes('emi') || name.includes('calculator')) buyEvents++;
    if (url.includes('/sell') || url.includes('/valuation') || name.includes('sell') || name.includes('valuation')) sellEvents++;
    if (url.includes('/owner') || name.includes('owner') || name.includes('list_property')) ownerEvents++;
  }

  if (sellEvents > 0 && sellEvents >= buyEvents) return 'SELLER';
  if (ownerEvents > 0 && ownerEvents >= rentEvents) return 'OWNER';
  if (rentEvents > buyEvents) return 'TENANT';
  if (buyEvents > 0) return 'BUYER';

  return 'GUEST';
}

/**
 * Advanced Role-Based AI Interest & Intent Detector
 */
function detectSessionInterest(session, events = [], propertiesMap = {}) {
  const rawEvents = Array.isArray(events) ? events : [];
  const persona = resolvePersona(session?.exact_role, session?.source, rawEvents);
  const userName = session?.user_full_name || session?.username || session?.lead_name || 'Client';

  // Extract property view stats
  const propStats = {};
  let latestPropertyId = null;
  let latestCalc = null;
  let latestSearch = null;
  let maxDuration = Number(session?.duration_seconds || 0);

  for (const ev of rawEvents) {
    const pId = ev.property_id;
    const evType = ev.event_type || '';
    const evName = ev.event_name || '';
    const payload = parsePayloadSafe(ev.payload);

    if (pId) {
      if (!propStats[pId]) {
        propStats[pId] = { views: 0, hasCalc: false, lastSeen: ev.created_at };
      }
      if (evType === 'property' || evName.includes('property')) {
        propStats[pId].views += 1;
        propStats[pId].lastSeen = ev.created_at;
        latestPropertyId = pId;
      }
      if (evType === 'calculator' || evName.includes('emi') || evName.includes('calculator')) {
        propStats[pId].hasCalc = true;
        latestCalc = payload;
        latestPropertyId = pId;
      }
    } else if (evType === 'calculator' || evName.includes('emi') || evName.includes('calculator')) {
      latestCalc = payload;
    } else if (evType === 'search' || evName.includes('search')) {
      latestSearch = payload;
    }
  }

  // Find top property
  let topPropId = null;
  let topWeight = -1;

  for (const [idStr, stat] of Object.entries(propStats)) {
    const id = Number(idStr);
    const weight = (stat.views * 3) + (stat.hasCalc ? 8 : 0) + (id === latestPropertyId ? 3 : 0);
    if (weight > topWeight) {
      topWeight = weight;
      topPropId = id;
    }
  }

  const propMeta = topPropId ? (propertiesMap[topPropId] || {}) : {};
  const propTitle = propMeta.title || propMeta.society_name || (topPropId ? `Property #${topPropId}` : null);
  const propLocality = propMeta.location_name || propMeta.locality || propMeta.city_name || '';
  const propPrice = propMeta.final_price || propMeta.budget || propMeta.price || null;
  const unitType = propMeta.unit_type || propMeta.property_subtype_name || '';

  // Intent Score Computation
  let intentScore = 20;
  const totalSteps = Number(session?.total_events || rawEvents.length || 0);

  if (topPropId) intentScore += 25;
  if (propStats[topPropId]?.views > 1) intentScore += Math.min(25, propStats[topPropId].views * 7);
  if (latestCalc) intentScore += 30;
  if (session?.lead_id) intentScore += 20;
  if (maxDuration > 90) intentScore += 10;
  if (totalSteps > 6) intentScore += 10;

  intentScore = Math.min(98, Math.max(20, intentScore));

  let intentLevel = 'EXPLORING';
  let intentLabel = 'Discovery';
  let badgeColor = 'slate';

  if (intentScore >= 72) {
    intentLevel = 'HIGH';
    intentLabel = 'High Intent';
    badgeColor = 'rose';
  } else if (intentScore >= 42) {
    intentLevel = 'MEDIUM';
    intentLabel = 'Evaluating';
    badgeColor = 'indigo';
  }

  // Generate Persona-Specific Intelligence, Metrics & Playbook
  let roleDisplay = 'Website Visitor';
  let roleIcon = '🌐';
  let summary = '';
  let executiveAction = '';
  let callingScript = '';
  let whatsappMessage = '';
  const objections = [];
  const signals = [];

  const financialMetrics = {
    estimated_loan_amount: latestCalc?.loan_amount ? Number(latestCalc.loan_amount) : (propPrice ? Math.round(Number(propPrice) * 0.8) : null),
    estimated_monthly_emi: latestCalc?.monthly_emi ? Number(latestCalc.monthly_emi) : null,
    estimated_down_payment: latestCalc?.down_payment ? Number(latestCalc.down_payment) : (propPrice ? Math.round(Number(propPrice) * 0.2) : null),
    estimated_rent: null,
    estimated_deposit: null,
    estimated_valuation_band: null,
    tenure_years: latestCalc?.tenure_years || 20,
    interest_rate: latestCalc?.interest_rate || 8.5,
  };

  if (persona === 'BUYER') {
    roleDisplay = 'Verified Buyer Prospect';
    roleIcon = '🎯';

    if (topPropId && propTitle) {
      signals.push(`Viewed verified listing: ${propTitle} (${unitType || 'Apartment'}) in ${propLocality || 'Pune'} ${propStats[topPropId]?.views || 1} time(s).`);
      if (latestCalc?.loan_amount) {
        signals.push(`Tested EMI calculation for ${formatInr(latestCalc.loan_amount)} loan (Monthly EMI: ${formatInr(latestCalc.monthly_emi)}).`);
      }
      if (propStats[topPropId]?.views > 2) {
        signals.push(`High repeat interest: Returned to view ${propTitle} multiple times in this session.`);
      }

      summary = `Buyer Prospect: Highly engaged with ${unitType ? `${unitType} at ` : ''}${propTitle} in ${propLocality || 'Pune'}${propPrice ? ` (${formatInr(propPrice)})` : ''}. ${latestCalc ? `Tested ₹${(latestCalc.loan_amount / 100000).toFixed(1)}L loan eligibility.` : 'Active consideration stage.'}`;
      executiveAction = `Call buyer to confirm ready possession preference and offer an exclusive on-site property walkthrough at ${propTitle}.`;

      callingScript = `"Hello ${userName}! This is Sales from Resale Expert. I noticed you were exploring the verified ${unitType || 'apartment'} at ${propTitle} in ${propLocality}. Since this property has clear titles and ready possession, I can arrange a private site visit for you this weekend. Would morning or afternoon suit you better?"`;

      whatsappMessage = `Hi ${userName}, this is Resale Expert 🏢. Saw your interest in the verified *${unitType || 'unit'} at ${propTitle}, ${propLocality}* (${formatInr(propPrice)}). It features 100% verified documentation and ready possession. Would you like me to send the complete floor plan and video walkthrough?`;

      objections.push(
        {
          objection: 'The price feels slightly higher than older buildings nearby.',
          response: 'Highlight clear title deed, higher undivided land share (UDS), and zero maintenance arrears compared to distressed listings.',
        },
        {
          objection: 'I need to check my loan approval first.',
          response: 'Offer our direct banking desk (SBI, HDFC, ICICI) with 0% processing fees and pre-approval within 24 hours.',
        }
      );
    } else if (latestSearch?.locality || latestSearch?.search_query) {
      const q = latestSearch.locality || latestSearch.search_query;
      const bhk = latestSearch.bhk ? `${latestSearch.bhk} ` : '';
      summary = `Buyer Discovery: Actively searching for ${bhk}apartments in ${q}. Filtered options matching their family requirements.`;
      executiveAction = `Send curated WhatsApp catalogue of top 3 verified resale properties in ${q}.`;

      callingScript = `"Hello ${userName}! I noticed you were looking for ${bhk}properties in ${q}. We have 3 newly listed verified resale homes with clean legal paperwork in that exact area. May I know your target possession date?"`;
      whatsappMessage = `Hi ${userName}! Based on your search for *${bhk}homes in ${q}*, here are 3 verified properties matching your criteria with video tours: resaleexpert.in/properties?location=${encodeURIComponent(q)}`;
    } else {
      summary = `Buyer Exploration: Browsing residential property inventory and price points across Pune.`;
      executiveAction = `Engage with personalized buyer requirement consultation.`;
      callingScript = `"Hello ${userName}! Thank you for visiting Resale Expert. We specialize in legally verified resale flats across Pune. What locality and BHK are you prioritizing for your new home?"`;
      whatsappMessage = `Hi ${userName}! Welcome to Resale Expert 🏠. Looking for verified resale properties in Pune? Reply with your preferred locality and budget, and our sales executive will share verified options directly!`;
    }
  } else if (persona === 'SELLER') {
    roleDisplay = 'Property Seller Prospect';
    roleIcon = '🏷️';
    financialMetrics.estimated_valuation_band = propPrice ? `${formatInr(Number(propPrice) * 0.95)} - ${formatInr(Number(propPrice) * 1.05)}` : 'Market Rate';

    signals.push(`Visited Seller portal & reviewed property valuation parameters.`);
    if (propLocality) signals.push(`Target locality interest: ${propLocality}.`);

    summary = `Seller Intent: Reviewing market pricing and resale options${propLocality ? ` in ${propLocality}` : ''}. Likely planning to sell or evaluate existing flat.`;
    executiveAction = `Call owner: Offer a complimentary registered sale deed market valuation report and connect with ready buyers.`;

    callingScript = `"Hello ${userName}! This is the Resale Expert Advisory Team. I noticed you were checking property valuations${propLocality ? ` in ${propLocality}` : ''}. We currently have pre-screened buyers with approved bank loans looking for ready resale units in your area. Would you like a free valuation report of recent transactions in your society?"`;

    whatsappMessage = `Hello ${userName}, planning to sell or evaluate your property in ${propLocality || 'Pune'}? Resale Expert has active buyers waiting for verified homes. We provide free professional photography, verified documentation, and 0% upfront listing charges. Reply 'EVALUATE' for a free society pricing report!`;

    objections.push(
      {
        objection: 'I already have multiple local brokers handling my flat.',
        response: 'Explain that Resale Expert has a network of 4,000+ pre-approved direct buyers, meaning faster closures without endless random walkthroughs.',
      },
      {
        objection: 'I want an above-market price.',
        response: 'Show registered sale deed data for their society and explain how proper staging and verified documentation attract maximum premium.',
      }
    );
  } else if (persona === 'OWNER') {
    roleDisplay = 'Asset Owner / Landlord';
    roleIcon = '🔑';
    const estRent = propPrice ? Math.round((Number(propPrice) * 0.035) / 12) : 25000;
    financialMetrics.estimated_rent = estRent;
    financialMetrics.estimated_deposit = estRent * 3;

    signals.push(`Accessed Owner/Rental management section.`);
    if (propLocality) signals.push(`Focus area: ${propLocality}.`);

    summary = `Landlord / Asset Owner: Reviewing rental listings and tenant management services${propLocality ? ` in ${propLocality}` : ''}.`;
    executiveAction = `Offer 100% managed rental services: police verification, doorstep biometric agreement, and corporate tenant matching.`;

    callingScript = `"Hello ${userName}! I'm calling from Resale Expert Owner Services. I noticed you were exploring rental options${propLocality ? ` in ${propLocality}` : ''}. We offer complete hassle-free rental management including corporate tenant screening and online biometric agreements at your doorstep. Are you looking to let out your property soon?"`;

    whatsappMessage = `Hello ${userName}, maximize your rental yield with Resale Expert Managed Rentals 🛡️. We ensure: 1️⃣ Verified corporate tenants, 2️⃣ Doorstep biometric agreement, 3️⃣ Guaranteed on-time rent. Would you like us to find a suitable tenant for your property?`;

    objections.push(
      {
        objection: 'I have strict tenant preferences (e.g. families only).',
        response: 'Reassure that all prospective tenants undergo KYC, employment verification, and owner pre-approval before scheduling visits.',
      },
      {
        objection: 'How does the agreement process work?',
        response: 'We handle government stamp duty, police verification, and biometric verification directly at your home or office.',
      }
    );
  } else if (persona === 'TENANT') {
    roleDisplay = 'Rental Tenant Prospect';
    roleIcon = '🛋️';
    const estRent = propPrice ? Math.round((Number(propPrice) * 0.035) / 12) : 22000;
    financialMetrics.estimated_rent = estRent;
    financialMetrics.estimated_deposit = estRent * 2;

    signals.push(`Browsing rental listings${propLocality ? ` in ${propLocality}` : ''}.`);

    summary = `Rental Seeker: Looking for ready rental apartments${propLocality ? ` in ${propLocality}` : ''} with transparent deposit terms.`;
    executiveAction = `Contact tenant: Share available verified rental flats with flexible deposit and immediate move-in.`;

    callingScript = `"Hello ${userName}! I noticed you were looking for rental apartments${propLocality ? ` in ${propLocality}` : ''}. We have owner-verified units with reasonable security deposits and quick online agreements. What is your preferred move-in date and budget?"`;

    whatsappMessage = `Hi ${userName}! Looking for rental flats in ${propLocality || 'Pune'}? Here are verified owner-listed properties ready for immediate inspection: resaleexpert.in/rent. What is your expected move-in date?`;

    objections.push(
      {
        objection: 'Why is the security deposit higher than expected?',
        response: 'Explain that our owner agreements are pre-negotiated with lower 2-3 month deposits compared to standard market 5-6 month demands, and deposits are refundable via escrow/legal deed.',
      },
      {
        objection: 'Will there be any hidden brokerage charges?',
        response: 'Clarify our 100% transparent pricing policy with zero surprise fees and end-to-end online agreement assistance.',
      }
    );
  } else if (persona === 'BROKER') {
    roleDisplay = 'Channel Partner / Broker';
    roleIcon = '🤝';
    signals.push(`Accessed Broker/Partner portal.`);
    summary = `Channel Partner: Reviewing co-broking inventory and inventory sharing options.`;
    executiveAction = `Connect with broker partner: Share commission structure and active buyer requirements.`;
    callingScript = `"Hello ${userName}! This is Partner Relations from Resale Expert. I noticed you were exploring our verified resale inventory. We offer 50:50 instant co-broking splits with direct buyer matching. Would you like to access our exclusive partner listing inventory?"`;
    whatsappMessage = `Hello Partner! Looking to close deals faster? Resale Expert offers verified resale listings with guaranteed commission protection and fast loan clearances. Let's collaborate: reply PARTNER to receive today's inventory sheet.`;
    objections.push(
      {
        objection: 'How do you protect broker commissions?',
        response: 'All client leads are timestamped and tagged under your partner ID in our CRM with guaranteed payout on registered sale deed.',
      },
      {
        objection: 'Are these properties direct with owner?',
        response: 'Yes, 100% of our inventory is directly owner-verified with title searches already completed.',
      }
    );
  } else {
    // Default GUEST / General Discovery
    roleDisplay = 'Website Visitor';
    roleIcon = '🌐';
    signals.push(`Browsed ${totalSteps} website pages.`);
    summary = `Top-of-Funnel Visitor: Browsed ${totalSteps} pages. No specific property or filter shortlisted yet.`;
    executiveAction = `Initiate requirement discovery (Buy vs Sell vs Rent) to capture contact details.`;
    callingScript = `"Hello! Thank you for visiting Resale Expert. Are you currently exploring to purchase a verified resale home, or looking to sell an existing property in Pune?"`;
    whatsappMessage = `Hello, thank you for visiting Resale Expert! We offer legally verified resale properties and full documentation support in Pune. Are you looking to Buy, Sell, or Rent?`;
    objections.push(
      {
        objection: 'I was just browsing casually.',
        response: 'Offer a free automated WhatsApp alert for new verified resale flats matching their preferred locality.',
      },
      {
        objection: 'How is Resale Expert different from other portals?',
        response: '100% of our properties have verified legal paperwork (Title Search Report, UDS, OCR verified) with zero hidden fees.',
      }
    );
  }

  const customerMindset = latestCalc
    ? `User is evaluating loan affordability and testing monthly EMI cash outflow.`
    : persona === 'SELLER'
    ? `Seller is testing market temperature to determine best price and timeline to sell.`
    : persona === 'OWNER'
    ? `Owner seeks reliable tenants with zero payment friction or society compliance hassles.`
    : persona === 'TENANT'
    ? `Tenant is looking for a verified rental home with low deposit and clear terms.`
    : persona === 'BROKER'
    ? `Channel partner is evaluating inventory availability and co-broking commission terms.`
    : `Visitor is in early discovery, reviewing Pune property options before committing.`;

  return {
    persona,
    role: persona,
    role_display: roleDisplay,
    role_icon: roleIcon,
    intent_level: intentLevel,
    intent_label: intentLabel,
    intent_score: intentScore,
    badge_color: badgeColor,

    has_detected_property: Boolean(topPropId),
    property_id: topPropId,
    property_title: propTitle,
    property_locality: propLocality,
    property_price: propPrice ? Number(propPrice) : null,
    formatted_price: formatInr(propPrice),
    unit_type: unitType,
    views_count: topPropId ? (propStats[topPropId]?.views || 1) : 0,

    financial_metrics: financialMetrics,
    behavioral_signals: signals,
    customer_mindset: customerMindset,

    summary,
    executive_action: executiveAction,
    executive_calling_script: callingScript,
    whatsapp_followup_message: whatsappMessage,
    objection_handling: objections,
  };
}

/**
 * Generate Deep Live AI Analysis Dossier for a Session
 * Passes Persona, Role, and Detailed Event History to OpenAI (from Settings Integration)
 */
async function generateDeepAiDossier(sessionId) {
  try {
    // 1. Fetch all events for this session
    const [events] = await db.query(
      `SELECT 
        e.*,
        p.society_name AS prop_society,
        p.location_name AS prop_locality,
        p.city_name AS prop_city,
        p.unit_type AS prop_unit_type,
        COALESCE(p.final_price, p.budget) AS prop_price,
        u.role AS user_exact_role,
        NULLIF(TRIM(CONCAT_WS(' ', u.salutation, u.first_name, u.last_name)), '') AS user_full_name,
        u.email AS user_email,
        u.phone AS user_phone
      FROM user_activity_events e
      LEFT JOIN my_properties p ON e.property_id = p.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.session_id = ?
      ORDER BY e.created_at ASC`,
      [sessionId]
    );

    if (!events || events.length === 0) {
      return {
        success: false,
        message: 'No events found for this session.',
      };
    }

    // Build Properties Map
    const propMap = {};
    for (const ev of events) {
      if (ev.property_id && !propMap[ev.property_id]) {
        propMap[ev.property_id] = {
          title: ev.prop_society || `Property #${ev.property_id}`,
          society_name: ev.prop_society,
          location_name: ev.prop_locality,
          city_name: ev.prop_city,
          unit_type: ev.prop_unit_type,
          price: ev.prop_price,
          final_price: ev.prop_price,
        };
      }
    }

    const firstRow = events[0];
    const sessionObj = {
      session_id: sessionId,
      total_events: events.length,
      lead_id: firstRow.lead_id,
      user_id: firstRow.user_id,
      exact_role: firstRow.user_exact_role || firstRow.source,
      source: firstRow.source,
      user_full_name: firstRow.user_full_name,
    };

    // 2. Base Persona & Role-Based Intelligence
    const baseInterest = detectSessionInterest(sessionObj, events, propMap);

    // 3. Attempt Live OpenAI Chat Completion with Settings Integration
    const aiConfig = await getAiConfig();

    if (aiConfig && aiConfig.apiKey) {
      try {
        const eventsDigest = events.map((e) => ({
          time: e.created_at,
          type: e.event_type,
          name: e.event_name,
          property: e.prop_society ? `${e.prop_society} in ${e.prop_locality} (${e.prop_unit_type || ''})` : e.property_id,
          payload: parsePayloadSafe(e.payload),
        }));

        const prompt = `
You are the Chief Sales & Lead Intelligence Officer for "Resale Expert" (resaleexpert.in in Pune, India).
Analyze this visitor tracking session. The lead's verified role is: ${baseInterest.role} (${baseInterest.role_display}).

ROLE & CONTEXT:
- Role: ${baseInterest.role}
- Person's Name: ${sessionObj.user_full_name || 'Prospect'}
- Primary Property / Asset: ${baseInterest.property_title ? `${baseInterest.property_title} in ${baseInterest.property_locality} (${baseInterest.formatted_price})` : 'General Exploration'}
- Intent Level: ${baseInterest.intent_level} (Score: ${baseInterest.intent_score}/100)

SESSION ACTIVITY EVENTS:
${JSON.stringify(eventsDigest.slice(-25), null, 2)}

BASE ROLE INTELLIGENCE:
${JSON.stringify(baseInterest, null, 2)}

CRITICAL INSTRUCTIONS:
- You MUST customize all intelligence to their role (${baseInterest.role}). If they are a Seller or Owner, NEVER pitch buying a home or taking a home loan! If they are a Tenant, talk about rent and deposit. If they are a Buyer, talk about ready possession and site visits.
- Make the calling script sound 100% natural, empathetic, and persuasive.

Return a STRICT JSON object matching this schema:
{
  "persona": "${baseInterest.persona}",
  "role_display": "${baseInterest.role_display}",
  "executive_summary": "2-sentence strategic breakdown tailored specifically to their ${baseInterest.role} actions and exact interest.",
  "identified_property": {
    "name": "${baseInterest.property_title || 'General Resale Inventory'}",
    "locality": "${baseInterest.property_locality || 'Pune'}",
    "budget_or_price": "${baseInterest.formatted_price || 'Evaluating'}",
    "interest_level": "${baseInterest.intent_level}"
  },
  "intent_score": ${baseInterest.intent_score},
  "buying_or_selling_signals": [
    "Specific behavioral signal 1",
    "Specific behavioral signal 2",
    "Specific behavioral signal 3"
  ],
  "customer_mindset": "What the ${baseInterest.role} is currently evaluating, calculating, or hesitating about.",
  "executive_calling_script": "A natural, high-converting 2-3 sentence phone calling script for the executive.",
  "whatsapp_message": "A crisp, engaging WhatsApp follow-up message ready to send.",
  "objection_handling": [
    { "objection": "Anticipated customer objection 1", "response": "Actionable sales rebuttal" },
    { "objection": "Anticipated customer objection 2", "response": "Actionable sales rebuttal" }
  ],
  "recommended_action": "High-priority next step for the sales executive."
}
`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${aiConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: aiConfig.model || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are the Chief Sales & Lead Intelligence Officer for a leading Indian Real Estate CRM. Output strictly valid JSON.',
              },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.65,
            max_tokens: 700,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            return {
              success: true,
              source: 'openai-live',
              model: aiConfig.model || 'gpt-4o-mini',
              dossier: {
                ...parsed,
                raw_interest: baseInterest,
              },
            };
          }
        }
      } catch (aiErr) {
        console.warn('OpenAI API call failed or timed out, using advanced role engine:', aiErr.message);
      }
    }

    // 4. Advanced Role-Based Fallback Engine
    const advancedRoleDossier = {
      persona: baseInterest.persona,
      role_display: baseInterest.role_display,
      executive_summary: baseInterest.summary,
      identified_property: {
        name: baseInterest.property_title || 'General Resale Inventory',
        locality: baseInterest.property_locality || 'Pune',
        budget_or_price: baseInterest.formatted_price || 'Evaluating',
        interest_level: baseInterest.intent_level,
      },
      intent_score: baseInterest.intent_score,
      buying_or_selling_signals: baseInterest.behavioral_signals,
      customer_mindset: baseInterest.customer_mindset,
      executive_calling_script: baseInterest.executive_calling_script,
      whatsapp_message: baseInterest.whatsapp_followup_message,
      objection_handling: baseInterest.objection_handling,
      recommended_action: baseInterest.executive_action,
      raw_interest: baseInterest,
    };

    return {
      success: true,
      source: 'advanced-role-engine',
      dossier: advancedRoleDossier,
    };
  } catch (err) {
    console.error('generateDeepAiDossier error:', err);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  getAiConfig,
  detectSessionInterest,
  generateDeepAiDossier,
  formatInr,
  resolvePersona,
};
