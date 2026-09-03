// controllers/template.controller.js
const fetch = global.fetch || require("node-fetch"); 
const { buildTemplatePrompt } = require("../utils/promptBuilder");
const Integration = require("../models/integration.model");

async function generateTemplate(req, res) {
  try {
    const payload = req.body || {};

    let apiKey = await Integration.getSetting("chatgpt", "api_key");
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
    }
    const model = (await Integration.getSetting("chatgpt", "model")) || "gpt-4o-mini";

    if (!apiKey) {
      return res.status(400).json({ 
        error: "ChatGPT / OpenAI API key is not configured. Please configure it in Settings > Integrations." 
      });
    }

    const prompt = buildTemplatePrompt(payload);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are a professional real-estate copywriting assistant that writes production-ready SMS, WhatsApp, and Email templates. Use placeholders like {name}, {first_name}, {otp}, {property_name}, {location}, {price}, {date} exactly as requested without alteration. Do not wrap in markdown code blocks or add conversational chat commentary.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      let errorMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.error?.message || errText;
      } catch (_) {}
      console.error("OpenAI API error:", errorMsg);
      return res.status(500).json({ error: errorMsg || `OpenAI error ${r.status}` });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ? data.choices[0].message.content.trim() : "";

    return res.json({ content: text, success: true });
  } catch (err) {
    console.error("generateTemplate error", err);
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

module.exports = { generateTemplate };
