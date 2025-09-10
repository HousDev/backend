// function label(k) {
//   const map = {
//     propertyType: "Property Type",
//     propertySubtype: "Subtype",
//     unitType: "Unit Type",
//     furnishing: "Furnishing",
//     city: "City",
//     location: "Location/Locality",
//     budget: "Budget",
//     parkingType: "Parking Type",
//     carpetArea: "Carpet Area (sq.ft)",
//     floor: "Floor",
//   };
//   return map[k] || k;
// }

// function buildPrompt(payload) {
//   const { formData, tone, lang, words } = payload;

//   // ✅ allowed fields (budget & parkingType included)
//   const allowed = [
//     "propertyType",
//     "propertySubtype",
//     "unitType",
//     "furnishing",
//     "city",
//     "location",
//     "budget",
//     "parkingType",
//     "carpetArea",
//     "floor",
//   ];

//   const lines = [];
//   lines.push(`Write a property listing description in ${lang}.`);
//   lines.push(`Tone: ${tone}. Target length: around ${words} words.`);
//   lines.push(
//     `Use ONLY these facts: property type, subtype, unit type, furnishing, city, location, budget, parking type, carpet area (sq.ft), and floor.`
//   );
//   lines.push(
//     `No false promises, no negotiation language, no hidden amenities. Write crisp, clear, buyer-friendly copy with a short CTA at the end (e.g., schedule a visit).`
//   );

//   lines.push(`\nFACTS:`);
//   for (const key of allowed) {
//     const v = formData?.[key];
//     if (v == null || v === "") continue;

//     if (key === "carpetArea") {
//       lines.push(`- ${label(key)}: ${v} sq.ft`);
//     } else {
//       lines.push(`- ${label(key)}: ${Array.isArray(v) ? v.join(", ") : v}`);
//     }
//   }

//   return lines.join("\n");
// }

// module.exports = { buildPrompt };


// utils/promptBuilder.js

/* ----------------------------------------
   Label helper (existing)
---------------------------------------- */
function label(k) {
  const map = {
    propertyType: "Property Type",
    propertySubtype: "Subtype",
    unitType: "Unit Type",
    furnishing: "Furnishing",
    city: "City",
    location: "Location/Locality",
    budget: "Budget",
    parkingType: "Parking Type",
    carpetArea: "Carpet Area (sq.ft)",
    floor: "Floor",
  };
  return map[k] || k;
}

/* ----------------------------------------
   Property Description Prompt (unchanged)
---------------------------------------- */
function buildPrompt(payload) {
  const { formData, tone, lang, words } = payload;

  const allowed = [
    "propertyType",
    "propertySubtype",
    "unitType",
    "furnishing",
    "city",
    "location",
    "budget",
    "parkingType",
    "carpetArea",
    "floor",
  ];

  const lines = [];
  lines.push(`Write a property listing description in ${lang}.`);
  lines.push(`Tone: ${tone}. Target length: around ${words} words.`);
  lines.push(
    `Use ONLY these facts: property type, subtype, unit type, furnishing, city, location, budget, parking type, carpet area (sq.ft), and floor.`
  );
  lines.push(
    `No false promises, no negotiation language, no hidden amenities. Write crisp, clear, buyer-friendly copy with a short CTA at the end (e.g., schedule a visit).`
  );

  lines.push(`\nFACTS:`);
  for (const key of allowed) {
    const v = formData?.[key];
    if (v == null || v === "") continue;

    if (key === "carpetArea") {
      lines.push(`- ${label(key)}: ${v} sq.ft`);
    } else {
      lines.push(`- ${label(key)}: ${Array.isArray(v) ? v.join(", ") : v}`);
    }
  }

  return lines.join("\n");
}

/* ----------------------------------------
   Template Content Prompt (REAL-ESTATE focused)
   - Driven by subject + category (preferred)
   - Short, professional, modern
   - Keep and use allowed variables only
---------------------------------------- */
function buildTemplatePrompt(payload = {}) {
  const {
    name = "",
    subject = "",
    channel = "sms",
    tone = "friendly",
    lang = "English",
    length = "short", // 'short' | 'medium' | 'long'
    category = "",
    priority = "",
  } = payload;

  // Prefer subject or category as the generation hint (this is for real-estate templates)
  const hint = subject || category || name || "";

  // Allowed variables for templates (real-estate oriented + common)
  const ALLOWED_VARS = [
    "{name}",
    "{first_name}",
    "{property_name}",
    "{property_id}",
    "{location}",
    "{price}",
    "{unit_no}",
    "{cta_url}",
    "{contact}",
    "{date}",
    "{time}",
  ];

  // Map length to recommended word counts (model guidance)
  const WORD_HINT = {
    short: channel === "email" ? "subject + ~40-70 words body" : "12-25 words",
    medium: channel === "email" ? "subject + ~70-120 words body" : "25-45 words",
    long: channel === "email" ? "subject + ~120-220 words body" : "45-80 words",
  };

  const lines = [];

  // Top-level instruction
  lines.push(`You are a professional real-estate copywriter. Produce a ${channel.toUpperCase()} template in ${lang}.`);
  lines.push(`Tone: ${tone}. Target size: ${WORD_HINT[length]}.`);
  if (category) lines.push(`Category: ${category}.`);
  if (priority) lines.push(`Priority: ${priority}.`);

  // Strict output rules (short & machine-consumable)
  lines.push(
    "REQUIREMENTS:\n" +
    "- Use ONLY the variables listed below when needed and keep their braces exactly. Do NOT invent other placeholders.\n" +
    `- Variables: ${ALLOWED_VARS.join(", ")}.\n` +
    "- Do NOT add any editor notes or meta commentary. Return only the template text (or subject + body for email).\n" +
    "- Keep language natural, concise, and realistic. Avoid superlatives like 'best', 'unmatched' unless factual.\n"
  );

  // Channel-specific instructions
  if (channel === "email") {
    lines.push(
      "- Email output MUST start with 'Subject: <short subject line>' on the first line, then a blank line, then the email body. Keep subject short and clear."
    );
  } else {
    lines.push("- For SMS/WhatsApp return a single message string. Keep it short and scannable.");
  }

  // Provide the hint to guide the model (subject/category)
  if (hint) {
    lines.push(`\nGUIDANCE: Use this hint to focus the message: "${hint}".`);
  } else {
    lines.push("\nGUIDANCE: No specific subject/category provided — produce a concise real-estate template appropriate for the channel.");
  }

  // Small real-estate examples (concise, variable-aware)
  lines.push("\nEXAMPLES (real-estate):");
  lines.push("SMS (short):");
  lines.push('"Hi {name}, the viewing for {property_name} is confirmed on {date} at {time}. Reply to confirm."');
  lines.push("\nWhatsApp (short marketing):");
  lines.push('"Hi {name}, {property_name} near {location} is available at {price}. View: {cta_url}"');
  lines.push("\nEmail (subject + body):");
  lines.push('"Subject: Quick update on {property_name}\n\nHi {first_name},\nWe have an update for {property_name} ({property_id}). Price: {price}. If you wish to visit, schedule here: {cta_url}.\nRegards,\n{store_name}"');

  // Final small instruction
  lines.push("\nReturn only the template text. Trim whitespace. Keep it professional and short.");

  return lines.join("\n");
}

/* ----------------------------------------
   Exports
---------------------------------------- */
module.exports = {
  buildPrompt,
  buildTemplatePrompt,
};
