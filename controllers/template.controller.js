// controllers/template.controller.js
const fetch = global.fetch || require("node-fetch"); // Node18+ has global fetch
const { buildTemplatePrompt } = require("../utils/promptBuilder");

async function generateTemplate(req, res) {
  try {
    const payload = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const prompt = buildTemplatePrompt(payload);

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // choose model available to you
        input: [
          {
            role: "system",
            content:
              "You are a concise assistant that writes production-ready SMS / WhatsApp / Email templates. Use placeholders like {name}, {order_id} exactly as shown. Do not add extra commentary.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_output_tokens: 800,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ error: errText });
    }

    const data = await r.json();

    // Normalize response similar to description.controller
    const text =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .map((c) =>
              Array.isArray(c.content)
                ? c.content.map((p) => p?.text || "").join("")
                : c?.content?.[0]?.text || ""
            )
            .join("\n")
        : data.output?.[0]?.content?.[0]?.text || "") ||
      (data.choices && data.choices[0]?.message?.content) ||
      "";

    return res.json({ content: text });
  } catch (err) {
    console.error("generateTemplate error", err);
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

module.exports = { generateTemplate };
