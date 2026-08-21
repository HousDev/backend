const SocietyModel = require("../models/SocietyModel");

/**
 * Normalizes a URL for comparison by stripping protocol, domain, and surrounding slashes.
 */
const normalizeUrl = (u) => {
  if (!u) return "";
  let pathStr = u;
  if (u.includes("://")) {
    try {
      const parsed = new URL(u);
      pathStr = parsed.pathname + parsed.search;
    } catch {
      const parts = u.split("//")[1];
      if (parts) {
        const si = parts.indexOf("/");
        if (si !== -1) pathStr = parts.substring(si);
      }
    }
  }
  return pathStr.toLowerCase().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
};

/**
 * Finds a society by ID or name and updates its photo labels in the master record.
 * @param {string|number} societyIdOrName 
 * @param {Array<{url: string, label: string}>} photos 
 */
async function syncSocietyPhotoLabels(societyIdOrName, photos) {
  if (!societyIdOrName || !Array.isArray(photos) || photos.length === 0) return;

  try {
    let society = null;

    // 1. Try to find by ID (UUID or integer number)
    const isId =
      Number.isInteger(Number(societyIdOrName)) ||
      (typeof societyIdOrName === "string" && societyIdOrName.includes("-"));

    if (isId) {
      society = await SocietyModel.getSocietyById(societyIdOrName);
    }

    // 2. If not found by ID, try finding by matching name
    if (!society) {
      const all = await SocietyModel.getAllSocieties();
      const targetName = String(societyIdOrName).trim().toLowerCase();
      society = all.find(
        (s) =>
          String(s.society_name || s.societyName || "").trim().toLowerCase() === targetName
      );
    }

    if (!society) {
      console.log(`[SocietySync] No society found matching identifier: ${societyIdOrName}`);
      return;
    }

    // 3. Parse existing society images
    let rawUrls = [];
    try {
      rawUrls = typeof society.image_urls === "string" 
        ? JSON.parse(society.image_urls) 
        : (society.image_urls || []);
    } catch (e) {
      rawUrls = [];
    }

    const societyImages = rawUrls.map((img) =>
      typeof img === "string"
        ? { url: img, label: "", type: "image" }
        : { url: img.url, label: img.label || "", type: img.type || "image" }
    );

    // 4. Build map of incoming photos normalized by path
    const incomingPhotoMap = new Map();
    photos.forEach((p) => {
      if (p && p.url) {
        const normUrl = normalizeUrl(p.url);
        if (normUrl) {
          incomingPhotoMap.set(normUrl, p);
        }
      }
    });

    // 5. Update matching society image labels
    let hasUpdates = false;
    const updatedSocietyImages = societyImages.map((sImg) => {
      const normSUrl = normalizeUrl(sImg.url);
      const match = incomingPhotoMap.get(normSUrl);

      if (match && match.label !== undefined && match.label !== sImg.label) {
        hasUpdates = true;
        return {
          ...sImg,
          label: match.label,
        };
      }
      return sImg;
    });

    // 6. Save back to societies table if any labels changed
    if (hasUpdates) {
      await SocietyModel.updateSocietyImages(society.id, updatedSocietyImages);
      console.log(
        `[SocietySync] Updated photo labels for society: ${
          society.society_name || society.societyName
        }`
      );
    }
  } catch (err) {
    console.error("[SocietySync] Error during society photo labels sync:", err);
  }
}

module.exports = { syncSocietyPhotoLabels };
