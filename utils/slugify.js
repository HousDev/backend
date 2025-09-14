// utils/slugify.js
function slugifyTextParts(id, propertyType, unitType, propertySubtype, location, city) {
  const baseParts = [propertyType, unitType, propertySubtype].filter(Boolean).join(" ");
  
  let locationPart = "";
  if (location && city) {
    locationPart = `in ${location} ${city}`;
  } else if (city) {
    locationPart = `in ${city}`;
  }

  const joined = [id, baseParts, locationPart].filter(Boolean).join(" ").toLowerCase().trim();

  if (!joined) return "property";

  const cleaned = joined
    .replace(/&/g, "and")
    .replace(/[’'“”"•·]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "property";
}

module.exports = { slugifyTextParts };
