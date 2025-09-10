const { buildPrompt } = require("../utils/promptBuilder");

// Node 18+ has global fetch. If you’re on Node <18, uncomment below:
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

async function generateDescription(req, res) {
  try {
    const payload = req.body || {};
    const prompt = buildPrompt(payload);

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "You are a real-estate copywriter. You write accurate, appealing listings without exaggeration.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }

    const data = await r.json();

    // Normalize possible response shapes
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

    return res.json({ text });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

module.exports = { generateDescription };
