// backend/utils/rssFetcher.js
const Parser = require("rss-parser");
const fetch = require("node-fetch"); // npm i node-fetch@2  (या undici)
const parser = new Parser({
  timeout: 20000,
  headers: {
    // कुछ sites bot को block करती हैं; UA/Accept देने से मदद मिलती है
    "User-Agent": "Mozilla/5.0 (RSSFetcher; +https://yourapp.example)",
    Accept:
      "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
  },
});

/** feed text fetcher (redirects follow) */
async function fetchText(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("Invalid feed URL");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching feed`);
  return await res.text();
}

/** parse RSS/Atom first, then try JSON Feed */
async function parseAnyFeedText(text) {
  try {
    // rss-parser string parsing
    return await parser.parseString(text);
  } catch (e1) {
    // JSON Feed fallback: https://jsonfeed.org/version/1
    try {
      const jf = JSON.parse(text);
      if (!jf || !Array.isArray(jf.items)) throw new Error("Not JSON Feed");

      const items = jf.items.map((i) => ({
        guid: i.id || i.url,
        title: i.title || "",
        link: i.url || "",
        isoDate: i.date_published || i.date_modified || null,
        content: i.content_html || i.content_text || "",
        contentSnippet: i.summary || "",
        author: (i.author && (i.author.name || i.author)) || "",
        categories: i.tags || [],
      }));

      return { title: jf.title || "", link: jf.home_page_url || "", items };
    } catch (e2) {
      // वही original message रखें ताकि UI में साफ़ दिखे
      throw new Error("Feed not recognized (RSS/Atom/JSON).");
    }
  }
}

/**
 * Fetch feed items and apply keyword filter when contentFilter === 'keywords'
 * @param {Object} source - rss_sources entity (camelCase)
 * @returns {Promise<{fetched:number, items:any[]}>}
 */
async function fetchAndFilter(source) {
  const text = await fetchText(source.url);
  const feed = await parseAnyFeedText(text);
  const items = Array.isArray(feed.items) ? feed.items : [];

  // ⚠️ आपके schema के अनुसार 'all' use करें (ना कि 'none')
  if (source.contentFilter === "all" || !source.contentFilter) {
    return { fetched: items.length, items };
  }

  const kw = Array.isArray(source.keywords)
    ? source.keywords.map((k) => String(k).toLowerCase())
    : [];

  if (source.contentFilter === "keywords" && kw.length) {
    const filtered = items.filter((it) => {
      const hay = [
        it.title || "",
        it.content || "",
        it["content:encoded"] || "",
        it.contentSnippet || "",
        it.summary || "",
      ]
        .join(" ")
        .toLowerCase();
      return kw.some((k) => hay.includes(k));
    });
    return { fetched: items.length, items: filtered };
  }

  // other modes (e.g., 'category') — अभी pass-through
  return { fetched: items.length, items };
}

module.exports = { fetchAndFilter };
