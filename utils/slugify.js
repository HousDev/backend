// utils/slugify.js
function slugifyTextParts(...parts) {
  const joined = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();

  if (!joined) return "property";

  const cleaned = joined
    .replace(/&/g, "and")
    .replace(/[’'“”"•·]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")    // remove accents
    .replace(/[^a-z0-9\s-]/g, "")       // allow a-z0-9 space dash
    .replace(/\s+/g, "-")               // spaces -> hyphen
    .replace(/-+/g, "-")                // collapse multiple hyphens
    .replace(/^-+|-+$/g, "");           // trim

  return cleaned || "property";
}

module.exports = { slugifyTextParts };
