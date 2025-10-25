
const sanitizeHtml = require("sanitize-html");

/* ----------------------------------------------------------
   LTR sanitizer (removes hidden bidi chars)
---------------------------------------------------------- */
const BIDI_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const sanitizeLTR = (html = "") =>
  (html || "")
    .replace(BIDI_REGEX, "")
    .replace(/\sdir\s*=\s*"(?:rtl|auto)"/gi, ' dir="ltr"')
    .replace(/\sdir\s*=\s*'(?:rtl|auto)'/gi, " dir='ltr'")
    .replace(/direction\s*:\s*rtl\s*;?/gi, "direction:ltr;")
    .replace(
      /unicode-bidi\s*:\s*(?:bidi-override|plaintext|isolate-override)\s*;?/gi,
      "unicode-bidi:isolate;"
    );

/* ----------------------------------------------------------
   Build OpenAI prompt (with word targets)
---------------------------------------------------------- */
const LENGTH_WORD_TARGET = {
  short: 700,
  medium: 1100,
  long: 1600,
  comprehensive: 2200,
};

function buildPrompt(body = {}) {
  const {
    title,
    tone = "professional",
    length = "medium", // short | medium | long | comprehensive
    audience = "general-public",
    includeSEO = true,
    includeImages = true,
    includeToc = true,
    category = "Real Estate",
  } = body;

  const target = LENGTH_WORD_TARGET[length] || LENGTH_WORD_TARGET.medium;
  const minWords = Math.floor(target * 0.9);

  return `
You are an expert Indian real-estate/finance content editor. Write ORIGINAL, SEO-optimized HTML.

Title: ${title}
Tone: ${tone}
Length: ${length} (~${target} words; not less than ${minWords} words)
Audience: ${audience}
Category: ${category}
Include SEO: ${includeSEO}
Include Images Hints: ${includeImages}
Include TOC: ${includeToc}

Return STRICT JSON with EXACT shape:
{
  "title": string,
  "excerpt": string,
  "seo": { "title": string, "description": string, "keywords": string[] },
  "tags": string[],
  "content_html": string,        // full clean HTML (no <html>/<body>)
  "hero": { "alt": string, "keywords": string[] },
  "inline_images": [{ "alt": string, "keywords": string[] }]
}

Rules:
- Use semantic headings (h2/h3). Sections should cover: Introduction, Market/Process (or Analysis), Tips/Playbook, FAQs, Conclusion. Add subheads where helpful.
- Include a Table of Contents ONLY ONCE at the top if included.
- No inline CSS (except inside <pre><code>), no scripts.
- Use Indian context (₹, corridors, examples) where relevant; be factual and precise.
- Keep paragraphs short, scannable; use lists and blockquotes where useful.
- Do NOT repeat “Tags” blocks. No meta commentary.
`;
}

/* ----------------------------------------------------------
   HTML Utilities for ToC / headings
---------------------------------------------------------- */
const hasTOC = (html = "") =>
  /<h2[^>]*>\s*Table of Contents\s*<\/h2>/i.test(html) ||
  /<nav[^>]*class=["']toc["'][^>]*>/i.test(html);

function addIdsToHeadings(html = "") {
  let i = 0;
  return html.replace(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) => {
    const cleanInner = String(inner).replace(/<[^>]+>/g, "").trim();
    if (/^table of contents$/i.test(cleanInner)) return m;
    i += 1;
    if (/\sid=/.test(attrs)) return m;
    return `<${tag} ${attrs} id="sec-${i}">${inner}</${tag}>`;
  });
}

/* Make headings’ inner text bold while preserving existing markup */
function makeHeadingsBold(html = "") {
  return html.replace(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attrs, inner) => {
    const cleanInner = inner.replace(/\s+/g, " ").trim();
    if (/^<strong>[\s\S]*<\/strong>$/i.test(cleanInner)) return m; // already bold
    if (/^table of contents$/i.test(cleanInner.replace(/<[^>]+>/g, ""))) return m; // leave TOC title
    // Wrap the whole inner content in strong while keeping inner tags
    return `<${tag}${attrs ? " " + attrs.trim() : ""}><strong>${inner}</strong></${tag}>`;
  });
}

function buildTOC(html = "") {
  const matches = Array.from(html.matchAll(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi));
  if (!matches.length) return "";

  const items = matches
    .map((m) => {
      const tag = (m[1] || "h2").toLowerCase();
      const text = String(m[3] || "").replace(/<[^>]+>/g, "").trim();
      if (!text || /^table of contents$/i.test(text)) return null;
      const idMatch = (m[0].match(/\sid=["']([^"']+)["']/i) || [])[1];
      const id = idMatch || "";
      if (!id) return null;
      return `<li class="${tag === "h3" ? "sub" : ""}">
        <a href="#${id}"><strong>${text}</strong></a>
      </li>`;
    })
    .filter(Boolean)
    .join("");

  if (!items) return "";
  return `
<nav class="toc" aria-label="Table of Contents">
  <h2>Table of Contents</h2>
  <ol>${items}</ol>
</nav>`.trim();
}

function ensureSingleTOC(html = "") {
  // Keep first TOC, remove the rest
  let firstKept = false;
  html = html.replace(/<nav[^>]*class=["']toc["'][^>]*>[\s\S]*?<\/nav>/gi, (m) => {
    if (firstKept) return "";
    firstKept = true;
    return m;
  });

  if (!hasTOC(html)) {
    // Need ids before building TOC
    let withIds = addIdsToHeadings(html);
    const tocHtml = buildTOC(withIds);
    if (tocHtml) {
      const injected = withIds.replace(/<p[^>]*>.*?<\/p>/i, (first) => `${first}\n${tocHtml}`);
      return injected !== withIds ? injected : `${tocHtml}\n${withIds}`;
    }
    return withIds;
  }
  return html;
}

/* Convert plain text to basic HTML (fallback) */
function plainToHtml(text = "") {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  lines.forEach((l) => {
    if (/^table of contents$/i.test(l)) out.push(`<h2>Table of Contents</h2>`);
    else if (/^(introduction|overview)$/i.test(l)) out.push(`<h2>Introduction</h2>`);
    else if (/^(market\/process|market trends|market analysis|process)$/i.test(l)) out.push(`<h2>${l}</h2>`);
    else if (/^(potential benefits|benefits)$/i.test(l)) out.push(`<h2>${l}</h2>`);
    else if (/^(risks( & constraints)?|constraints)$/i.test(l)) out.push(`<h2>${l}</h2>`);
    else if (/^(tips|tips for indian corporates|playbook|pro tips)$/i.test(l)) out.push(`<h2>${l}</h2>`);
    else if (/^(illustrative use cases|use cases)$/i.test(l)) out.push(`<h2>${l}</h2>`);
    else if (/^faqs?$/i.test(l)) out.push(`<h2>FAQs</h2>`);
    else if (/^conclusion$/i.test(l)) out.push(`<h2>Conclusion</h2>`);
    else if (/^[-*•]\s+/.test(l)) {
      const li = l.replace(/^[-*•]\s+/, "");
      if (!out.length || !out[out.length - 1].startsWith("<ul")) out.push("<ul>");
      out.push(`<li>${li}</li>`);
    } else {
      if (out.length && out[out.length - 1] === "<ul>") out.push("</ul>");
      out.push(`<p>${l}</p>`);
    }
  });
  if (out.length && out[out.length - 1] === "<ul>") out.push("</ul>");
  return out.join("\n");
}

/* Sanitize + LTR */
function sanitizeHtmlSafe(html = "") {
  const cleaned = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img", "h2", "h3", "pre", "code", "blockquote", "nav", "ol"
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt"],
      "*": ["id", "aria-label"]
    },
    allowedSchemes: ["http", "https", "data", "mailto"],
  });
  return sanitizeLTR(cleaned);
}

/* ----------------------------------------------------------
   Main controller
---------------------------------------------------------- */
exports.generateBlogFromTitle = async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ success: false, message: "Missing OPENAI_API_KEY" });
    }
    const { title, includeToc = true } = req.body || {};
    if (!title || typeof title !== "string") {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You return polished, valid HTML for real-estate/finance blogs." },
          { role: "user", content: buildPrompt(req.body) },
        ],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ success: false, message: err || `OpenAI error ${r.status}` });
    }

    const data = await r.json();
    let json;
    try {
      json = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    } catch {
      json = { content_html: data?.choices?.[0]?.message?.content || "" };
    }

    // 1) Raw content
    let html = String(json.content_html || "").trim();

    // 2) Fallback: plain text → HTML
    if (!/<(h[23]|p|ul|ol|blockquote|nav)\b/i.test(html)) {
      html = plainToHtml(html || "");
    }

    // 3) Sanitize + LTR
    html = sanitizeHtmlSafe(html);

    // 4) Add IDs to headings (before building ToC)
    html = addIdsToHeadings(html);

    // 5) Ensure a single TOC
    if (includeToc) html = ensureSingleTOC(html);
    else html = html.replace(/<nav[^>]*class=["']toc["'][^>]*>[\s\S]*?<\/nav>/gi, "");

    // 6) Make all H2/H3 headings bold (content inside headings)
    html = makeHeadingsBold(html);

    // 7) Remove duplicate "Tags" blocks, if any
    let tagsSeen = false;
    html = html.replace(
      /(<p>\s*<strong>\s*Tags:\s*<\/strong>[\s\S]*?<\/p>)/gi,
      (m) => (tagsSeen ? "" : ((tagsSeen = true), m))
    );

    // 8) Excerpt
    const excerpt =
      (json.excerpt && String(json.excerpt).trim()) ||
      html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) + "...";

    return res.json({
      success: true,
      article: {
        title: json.title || title,
        excerpt,
        content: html,
        seoTitle: json?.seo?.title || (json.title || title),
        seoDescription:
          json?.seo?.description ||
          `Insights on: ${json.title || title}. Detailed analysis, process, tips, FAQs & conclusion.`,
        tags: Array.isArray(json?.tags)
          ? json.tags
          : json?.seo?.keywords || ["Finance", "India", "Policy", "RBI"],
        aiImages: { hero: json.hero || null, inline: json.inline_images || [] },
        category: req.body?.category || " Real Estate",
        status: "draft",
      },
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ success: false, message: e?.message || "AI generation failed" });
  }
};
