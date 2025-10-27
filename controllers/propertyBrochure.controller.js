// controllers/propertyBrochure.controller.js
const Property = require("../models/Property");
const path = require("path");
const fs = require("fs-extra");
const puppeteer = require("puppeteer");

/** Quick mime by extension for local files */
function guessMime(p) {
  const ext = (p || "").toLowerCase();
  if (ext.endsWith(".png")) return "image/png";
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg")) return "image/jpeg";
  if (ext.endsWith(".webp")) return "image/webp";
  if (ext.endsWith(".gif")) return "image/gif";
  if (ext.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

exports.generateBrochuresBulkSinglePDF = async (req, res) => {
  try {
    /* --------------------------- INPUT & DEBUG --------------------------- */
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = rawIds.filter(Boolean).map(String);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: "ids[] required" });
    }

    console.log("[Brochure] Request received", {
      ids,
      customizations: req.body?.customizations || null,
      includeCover: req.body?.includeCover,
      includeTOC: req.body?.includeTOC,
      publicBaseUrl: req.body?.publicBaseUrl,
      fileName: req.body?.fileName,
      overridesCount: Array.isArray(req.body?.overrides) ? req.body.overrides.length : 0,
    });

    const sel = new Set((req.body?.customizations?.selectedContent || []).filter(Boolean));
    const showAny = (...keys) => keys.some((k) => sel.has(k));
    console.log("[Brochure] Selected content keys:", Array.from(sel));

    const theme = {
      primary: req.body?.customizations?.primaryColor || "#0b3856",
      secondary: req.body?.customizations?.secondaryColor || "#E6761D",
      font: req.body?.customizations?.fontStyle || "modern",
      layout: req.body?.customizations?.layout || "standard",
      watermark: Boolean(req.body?.customizations?.watermark ?? true),

      // ⬇️ Keep companyLogo (cover uses this), add footerLogo for header card (right of pill)
      companyLogo: req.body?.customizations?.companyLogo || "",
      footerLogo: req.body?.customizations?.footerLogo || "",
    };

    const includeCover = Boolean(req.body?.includeCover ?? true);
    const includeTOC = Boolean(req.body?.includeTOC ?? true);
    const publicBaseUrl = String(req.body?.publicBaseUrl || "").replace(/\/+$/, "");
    const fileName =
      (req.body?.fileName && String(req.body.fileName).trim()) ||
      `property-brochures-${Date.now()}.pdf`;

    console.log("[Brochure] Theme:", theme);
    console.log("[Brochure] Options:", { includeCover, includeTOC, publicBaseUrl, fileName });

    const overridesArr = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const overridesById = new Map();
    for (const o of overridesArr) {
      const oid = o?.id ?? o?.propertyId ?? o?.property_id;
      if (oid != null) overridesById.set(String(oid), o);
    }

    /* ------------------------------ HELPERS ------------------------------ */
    const esc = (s = "") =>
      String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const safe = (v, d = "—") => (v == null || (typeof v === "string" && v.trim() === "") ? d : v);
    const num = (v) => {
      if (v == null || v === "") return 0;
      const n = Number(String(v).replace(/[^\d.-]/g, ""));
      return Number.isNaN(n) ? 0 : n;
    };
    const currency = (val) => {
      const n = num(val);
      if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
      if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
      return `₹${n.toLocaleString("en-IN")}`;
    };
    const monthName = (m) => {
      const n = typeof m === "string" ? parseInt(m, 10) : m;
      if (!n || n < 1 || n > 12) return "";
      return new Date(0, n - 1).toLocaleString("en", { month: "long" });
    };
    const slugify = (s = "") =>
      s.toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    const pickFirstStr = (...vals) =>
      vals
        .map((v) => (typeof v === "string" ? v : v == null ? "" : String(v)))
        .map((s) => s.trim())
        .find(Boolean) || "";
    const splitPrimaryAndCity = (s) => {
      const parts = (s || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const city = parts[parts.length - 1];
        const primary = parts.slice(0, parts.length - 1).join(", ");
        return { primary, city };
      }
      return { primary: (s || "").trim(), city: "" };
    };

    /** If a path is local /uploads, embed as data URL; else make absolute with publicBaseUrl */
    async function toDataUrlIfLocal(urlish) {
      if (!urlish) return "";
      // already data or http(s)
      if (/^data:|^https?:\/\//i.test(urlish)) return urlish;

      if (urlish.startsWith("/uploads/")) {
        // filesystem path relative to backend root
        const abs = path.join(__dirname, "..", urlish);
        try {
          const buf = await fs.readFile(abs);
          const mime = guessMime(urlish);
          return `data:${mime};base64,${buf.toString("base64")}`;
        } catch (e) {
          console.warn("[Brochure] Failed to read local upload for dataURL:", abs, e?.message);
          // fallthrough to absolute with publicBaseUrl
        }
      }
      // fallback: prefix publicBaseUrl if present
      if (publicBaseUrl && urlish.startsWith("/")) return `${publicBaseUrl}${urlish}`;
      return urlish;
    }

    function resolveAssetUrl(urlish) {
      if (!urlish) return "";
      if (/^data:|^https?:\/\//i.test(urlish)) return urlish;
      if (publicBaseUrl && urlish.startsWith("/")) return `${publicBaseUrl}${urlish}`;
      return urlish;
    }

    /** 🔧 STRICT executive normalization (name/email/phone) */
    const normalizeExecutive = (db) => {
      const objCandidates = [
        db.assigned_to,
        db.assignedTo,
        db.executive,
        db.raw?.assigned_to,
        db.raw?.executive,
      ].filter(Boolean);

      const flat = {
        name:
          db.executive_name ||
          db.assigned_to_name ||
          db.raw?.assigned_to_name ||
          db.raw?.executive_name ||
          "",
        email:
          db.executive_email ||
          db.assigned_to_email ||
          db.raw?.assigned_to_email ||
          db.raw?.executive_email ||
          "",
        phone:
          db.executive_phone ||
          db.assigned_to_phone ||
          db.raw?.assigned_to_phone ||
          db.raw?.executive_phone ||
          "",
      };

      const base = { ...(objCandidates[0] || {}) };
      const name = base.name || flat.name || "";
      const email = base.email || flat.email || "";
      const phone = base.phone || flat.phone || "";

      if (!name && !email && !phone) return null;
      return { name, email, phone };
    };

    /** Normalize DB row → canonical shape, include details + assigned_to */
    const normalize = (db) => {
      const type = pickFirstStr(db.type, db.property_type, db.propertyType, db.property_type_name);
      const unitType = pickFirstStr(db.unitType, db.unit_type, db.unitTypeName);
      const subtype = pickFirstStr(db.subtype, db.property_subtype_name, db.propertySubtype);

      let locationNormalized = pickFirstStr(db.locationNormalized, db.location_normalized, db.normalized_location);
      let location = pickFirstStr(
        db.location,
        db.location_name,
        db.locality,
        db.area,
        db.neighbourhood,
        db.address?.line1,
        db.address_line1
      );
      let city = pickFirstStr(db.city, db.city_name, db.town, db.address?.city, db.address_city);

      if (!locationNormalized) {
        const primary = location || "";
        locationNormalized =
          primary && city
            ? `${primary}, ${city}`.replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ")
            : primary || city || "";
      }
      if (!city && locationNormalized) {
        const { primary, city: inferredCity } = splitPrimaryAndCity(locationNormalized);
        if (inferredCity) {
          city = inferredCity;
          if (!location) location = primary;
        }
      }

      const id = db.id ?? db.property_id ?? db.propertyId;
      const propertyId = db.propertyId ?? db.property_id ?? db.id;
      const slug = pickFirstStr(db.slug, db.property_slug, db.seo_slug);

      // photos/images (normalize to array of strings)
      let photos = [];
      if (Array.isArray(db.images)) photos = db.images;
      else if (Array.isArray(db.photos)) photos = db.photos;
      else if (db.images) photos = [db.images];
      else if (db.photos) photos = [db.photos];
      photos = photos.filter(Boolean).map(String);

      // furnishing items
      let furnishingItems = [];
      if (Array.isArray(db.furnishingItems)) furnishingItems = db.furnishingItems;
      else if (Array.isArray(db.furnishing_items)) furnishingItems = db.furnishing_items;

      const assigned_to = normalizeExecutive(db);

      return {
        id,
        propertyId,
        slug,
        title: db.title || db.society_name || "",
        type,
        unitType,
        subtype,

        location,
        locationNormalized,
        city,
        location_name: db.location_name || null,
        carpet_area: db.carpet_area ?? db.square_feet ?? db.carpetArea ?? null,

        price: db.price ?? db.final_price ?? db.budget ?? 0,
        final_price: db.final_price ?? null,
        price_type: db.price_type ?? null,

        bedrooms: db.bedrooms ?? db.bhk ?? "",
        bathrooms: db.bathrooms ?? db.bath ?? "",

        parking_type: db.parking_type ?? db.parking ?? null,
        parking_qty: db.parking_qty ?? null,
        unit_no: db.unit_no ?? db.unitNo ?? null,
        area: db.area ?? null,
        property_type_name: db.property_type_name ?? null,
        property_subtype_name: db.property_subtype_name ?? null,
        unit_type: db.unit_type ?? null,
        floor: db.floor ?? null,
        total_floors: db.total_floors ?? db.totalFloors ?? null,

        furnishing: db.furnishing || db.furnishing_level || db.furnishing_status || "",
        possessionMonth: db.possessionMonth || db.possession_month || "",
        possessionYear: db.possessionYear || db.possession_year || db.built_year || "",
        facing: db.facing || "",
        builtYear: db.builtYear || db.built_year || "",
        verified: Boolean(db.verified),
        featured: Boolean(db.featured),
        views: db.views ?? "",
        listedDays: db.listedDays ?? "",
        aiScore: db.aiScore ?? "",
        priceGrowth: db.priceGrowth ?? "",
        investmentGrade: db.investmentGrade ?? "",
        description: db.description || db.details || "",
        photos,
        amenities: Array.isArray(db.amenities) ? db.amenities : db.amenities ? [db.amenities] : [],
        furnishingItems,

        assigned_to,

        raw: {
          floor: db.floor,
          totalFloors: db.total_floors || db.totalFloors,
          wing: db.wing,
          unitNo: db.unit_no || db.unitNo,
          nearby_places: db.nearby_places || [],
          address: db.address || db.raw_address || "",
          assigned_to: db.assigned_to || null,
        },
      };
    };

    /** Merge overrides (supports details, images & inline assets) */
    const applyOverrides = (p) => {
      const ov = overridesById.get(String(p.id ?? p.propertyId));
      if (!ov) return p;

      const merged = { ...p };

      const assignIf = (key, dstKey = key) => {
        if (ov[key] !== undefined) merged[dstKey] = ov[key];
      };

      if (Array.isArray(ov.photos)) merged.photos = ov.photos.filter(Boolean);
      if (Array.isArray(ov.images)) merged.photos = ov.images.filter(Boolean);

      assignIf("furnishing");
      if (Array.isArray(ov.furnishingItems)) {
        const cleaned = ov.furnishingItems
          .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
          .map((s) => s.trim())
          .filter(Boolean);
        const seen = new Set();
        merged.furnishingItems = cleaned.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
      }

      assignIf("parking_type");
      assignIf("parking_qty");
      assignIf("unit_no");
      assignIf("area");
      assignIf("location_name");
      assignIf("carpet_area");
      assignIf("property_type_name");
      assignIf("property_subtype_name");
      assignIf("unit_type");
      assignIf("floor");
      assignIf("total_floors");
      assignIf("price_type");
      assignIf("final_price");

      if (ov.assets && typeof ov.assets === "object") {
        merged.assets = { ...ov.assets };
      }

      if (ov.assigned_to && typeof ov.assigned_to === "object") {
        const { name, email, phone } = ov.assigned_to;
        merged.assigned_to = {
          name: name || merged.assigned_to?.name || "",
          email: email || merged.assigned_to?.email || "",
          phone: phone || merged.assigned_to?.phone || "",
        };
      }

      return merged;
    };

    const computeLocationLine = (p) => {
      const primaryRaw = p.locationNormalized || p.location || "";
      const cityRaw = p.city || "";
      const primary = primaryRaw.trim();
      const city = cityRaw.trim();
      if (!primary && !city) return "";
      if (!primary) return city;
      if (!city) return primary;
      if (primary.toLowerCase().includes(city.toLowerCase())) return primary;
      return `${primary}, ${city}`;
    };

    const buildDeepUrl = (p) => {
      if (!showAny("propertyUrl")) return "";
      if (!publicBaseUrl) return "";
      const slug = p.slug || slugify(`${p.type || ""}-${p.unitType || ""}-${p.title || ""}-${p.city || ""}`);
      const suffix = slug || p.id || "";
      return `${publicBaseUrl}/properties/${suffix}`;
    };

    const makeTitleText = (p) => {
      const titleParts = [p.type, p.unitType, p.subtype].map((x) => (x || "").toString().trim()).filter(Boolean);
      const byTypes = titleParts.join(" ").replace(/\s{2,}/g, " ").trim();
      return byTypes || p.title || "Property";
    };

    /** One property section HTML */
    const sectionHtml = (p, index) => {
      const inlineImg = p?.assets?.mainImageDataUrl;
      const imgs = Array.isArray(p.photos) && p.photos.length ? p.photos : [
        "https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg",
      ];
      // main image will be resolved to data URL/absolute below (async outside)
      const mainImage = inlineImg || imgs[0];

      console.log("[Brochure] Property images for", p.id, {
        inlineProvided: Boolean(inlineImg),
        mainImageUsed: mainImage,
        photosCount: Array.isArray(p.photos) ? p.photos.length : 0,
      });

      const effectivePrice = p.price ?? p.final_price ?? 0;
      const pricePerSqFt =
        effectivePrice && p.carpet_area
          ? Math.round(num(effectivePrice) / Math.max(1, num(p.carpet_area)))
          : null;

      const locationLineStr = computeLocationLine(p);
      const url = buildDeepUrl(p);

      const headerBlock = `
        <section class="header-card">
          <div class="header-left">
            <span class="id-pill">#REP-${p.id ?? index + 1}</span>
            <div class="title-location-wrap">
              <div class="title-row">${esc(makeTitleText(p))}</div>
              ${showAny("location") && locationLineStr ? `<div class="location-inline">${esc(locationLineStr)}</div>` : ""}
            </div>
          </div>
          <div class="header-right">
            ${theme.footerLogo ? `<div class="logo-wrap"><img src="${esc(theme.footerLogo)}" alt="logo" /></div>` : ""}
            <div class="badges">
              ${p.featured ? `<span class="badge featured">FEATURED</span>` : ""}
              ${p.verified ? `<span class="badge verified">VERIFIED</span>` : ""}
            </div>
          </div>
        </section>`;

      const imageBlock = showAny("mainImage")
        ? `<div class="image-container">
             <img class="cover" src="${esc(mainImage)}" alt="cover" />
             ${url ? `<a href="${esc(url)}" class="view-property-btn-overlay">View Property →</a>` : ""}
           </div>`
        : "";

      const priceBlock = showAny("price")
        ? `<section class="price">
             <div class="left">
               <div class="label">Property Price</div>
               <div class="value priceVal">${currency(effectivePrice)}</div>
             </div>
             ${pricePerSqFt ? `<div class="right"><div class="label">Per Sq Ft</div><div class="value">₹${pricePerSqFt.toLocaleString("en-IN")}</div></div>` : ""}
           </section>`
        : "";

      const stats = [];
      if (showAny("bedrooms")) stats.push(`<div class="kv"><span>Bedrooms</span><span>${esc(safe(p.bedrooms))}</span></div>`);
      if (showAny("bathrooms")) stats.push(`<div class="kv"><span>Bathrooms</span><span>${esc(safe(p.bathrooms))}</span></div>`);
      if (showAny("carpet_area", "carpetArea")) {
        const ca = p.carpet_area ?? p.carpetArea;
        stats.push(`<div class="kv"><span>Carpet Area</span><span>${esc(safe(ca))} sq ft</span></div>`);
      }
      const statsBlock = stats.length ? `<section class="stats">${stats.join("")}</section>` : "";

      const descriptionBlock =
        showAny("description") && p.description
          ? `<section><h3>About Property</h3><p>${esc(p.description)}</p></section>`
          : "";

      const details = [];
      if (showAny("furnishing"))
        details.push(`<div><span class="k">Furnishing:</span><span class="v">${esc(safe(p.furnishing))}</span></div>`);
      if (showAny("possession") && (p.possessionMonth || p.possessionYear)) {
        const pos = [monthName(p.possessionMonth), p.possessionYear].filter(Boolean).join(" ");
        details.push(`<div><span class="k">Possession:</span><span class="v">${esc(pos || "—")}</span></div>`);
      }
      if (showAny("facing"))
        details.push(`<div><span class="k">Facing:</span><span class="v">${esc(safe(p.facing))}</span></div>`);
      if (showAny("builtYear"))
        details.push(`<div><span class="k">Built Year:</span><span class="v">${esc(safe(p.builtYear || p.possessionYear))}</span></div>`);

      if (showAny("parking_type") && p.parking_type)
        details.push(`<div><span class="k">Parking Type:</span><span class="v">${esc(p.parking_type)}</span></div>`);
      if (showAny("parking_qty") && (p.parking_qty || p.parking_qty === 0))
        details.push(`<div><span class="k">Parking Qty:</span><span class="v">${esc(p.parking_qty)}</span></div>`);
      if (showAny("unit_no") && p.unit_no)
        details.push(`<div><span class="k">Unit No:</span><span class="v">${esc(p.unit_no)}</span></div>`);
      if (showAny("area") && (p.area || p.area === 0))
        details.push(`<div><span class="k">Area:</span><span class="v">${esc(p.area)}</span></div>`);
      if (showAny("location_name") && p.location_name)
        details.push(`<div><span class="k">Location Name:</span><span class="v">${esc(p.location_name)}</span></div>`);
      if (showAny("property_type_name") && p.property_type_name)
        details.push(`<div><span class="k">Property Type:</span><span class="v">${esc(p.property_type_name)}</span></div>`);
      if (showAny("property_subtype_name") && p.property_subtype_name)
        details.push(`<div><span class="k">Property Subtype:</span><span class="v">${esc(p.property_subtype_name)}</span></div>`);
      if (showAny("unit_type") && (p.unit_type || p.unitType))
        details.push(`<div><span class="k">Unit Type:</span><span class="v">${esc(p.unit_type || p.unitType)}</span></div>`);
      if (showAny("floor") && (p.floor || p.floor === 0))
        details.push(`<div><span class="k">Floor:</span><span class="v">${esc(p.floor)}</span></div>`);
      if (showAny("total_floors") && (p.total_floors || p.total_floors === 0))
        details.push(`<div><span class="k">Total Floors:</span><span class="v">${esc(p.total_floors)}</span></div>`);
      if (showAny("price_type") && p.price_type)
        details.push(`<div><span class="k">Price Type:</span><span class="v">${esc(p.price_type)}</span></div>`);
      if (showAny("final_price") && (p.final_price || p.final_price === 0))
        details.push(`<div><span class="k">Final Price:</span><span class="v">${esc(currency(p.final_price))}</span></div>`);

      if (showAny("floor") && (p.raw?.floor || p.raw?.totalFloors)) {
        const f = p.raw.floor && p.raw.totalFloors ? `${p.raw.floor} / ${p.raw.totalFloors}` : p.raw.floor ?? "—";
        details.push(`<div><span class="k">Floor (legacy):</span><span class="v">${esc(f)}</span></div>`);
      }
      if (showAny("wing") && p.raw?.wing)
        details.push(`<div><span class="k">Wing:</span><span class="v">${esc(p.raw.wing)}</span></div>`);
      if (showAny("unitNo") && p.raw?.unitNo)
        details.push(`<div><span class="k">Unit No (legacy):</span><span class="v">${esc(p.raw.unitNo)}</span></div>`);

      const detailsBlock = details.length
        ? `<section><h3>Property Details</h3><div class="detailsGrid">${details.join("")}</div></section>`
        : "";

      const amenitiesBlock =
        showAny("amenities") && p.amenities?.length
          ? `<section><h3>Amenities</h3><div class="chips">${p.amenities.map((a) => `<span>${esc(a)}</span>`).join("")}</div></section>`
          : "";

      const furnishingItemsBlock =
        showAny("furnishingItems") && p.furnishingItems?.length
          ? `<section><h3>Furnishing Items</h3><div class="chips purple">${p.furnishingItems
              .map((a) => `<span>${esc(a)}</span>`)
              .join("")}</div></section>`
          : "";

      const nearbyBlock =
        showAny("nearbyPlaces") && p.raw?.nearby_places?.length
          ? `<section><h3>Nearby Places</h3><ul class="nearby">${p.raw.nearby_places
              .slice(0, 6)
              .map(
                (pl) =>
                  `<li>• ${esc(pl.name || "")} ${pl.distance ? `(${esc(pl.distance)}${esc(pl.unit || "")})` : ""}</li>`
              )
              .join("")}</ul></section>`
          : "";

      const investItems = [];
      if (showAny("aiScore"))
        investItems.push(`<div><span class="k">AI Score:</span><span class="v strong">${esc(safe(p.aiScore || "94"))}/100</span></div>`);
      if (showAny("priceGrowth"))
        investItems.push(`<div><span class="k">Growth:</span><span class="v strong green">${esc(safe(p.priceGrowth || "+12.5%"))}</span></div>`);
      if (showAny("investmentGrade"))
        investItems.push(`<div><span class="k">Investment:</span><span class="v strong blue">${esc(safe(p.investmentGrade || "A+"))}</span></div>`);
      const investmentBlock = investItems.length
        ? `<section class="invest"><h3>AI Investment Analysis</h3><div class="detailsGrid">${investItems.join("")}</div></section>`
        : "";

      const activityItems = [];
      if (showAny("views")) activityItems.push(`<div class="kv"><span>Total Views</span><span>${esc(safe(p.views))}</span></div>`);
      if (showAny("listedDays"))
        activityItems.push(`<div class="kv"><span>Listed</span><span>${p.listedDays ? `${esc(p.listedDays)} days ago` : "—"}</span></div>`);
      const activityBlock = activityItems.length ? `<section><h3>Property Activity</h3><div class="stats">${activityItems.join("")}</div></section>` : "";

      // ✅ Contact block
      const showContact = showAny("agentInfo") || showAny("assignedToInfo") || showAny("contactDetails");
      const contactBlock =
        showContact && p.assigned_to
          ? `<div class="contact-row">
               <div class="contact-item">
                 <strong>Executive:</strong> <span>${esc(p.assigned_to.name || "—")}</span>
               </div>
               ${p.assigned_to.email ? `
               <div class="contact-item">
                 <strong>Email:</strong> <a href="mailto:${esc(p.assigned_to.email)}">${esc(p.assigned_to.email)}</a>
               </div>` : ""}
               ${p.assigned_to.phone ? `
               <div class="contact-item">
                 <strong>Phone:</strong> <a href="tel:${esc(p.assigned_to.phone)}">${esc(p.assigned_to.phone)}</a>
               </div>` : ""}
             </div>`
          : "";

      const watermarkBlock = theme.watermark
        ? `<footer>Powered by ResaleExpert • Generated on ${new Date().toLocaleDateString()}</footer>`
        : "";

      return `
        <div class="prop-section" id="prop-${p.id}">
          ${headerBlock}
          ${imageBlock}
          ${priceBlock}
          ${statsBlock}
          ${descriptionBlock}
          ${detailsBlock}
          ${amenitiesBlock}
          ${furnishingItemsBlock}
          ${nearbyBlock}
          ${investmentBlock}
          ${activityBlock}
          ${contactBlock}
          ${watermarkBlock}
        </div>
        <div class="page-break"></div>`;
    };

    /* ------------------------- FETCH & BUILD CONTENT ------------------------ */
    console.log("[Brochure] Fetching properties...");
    const rows = await Promise.all(
      ids.map((rawId) =>
        Property.getById(String(rawId))
          .then((r) => {
            if (!r) console.warn("[Brochure] Property not found for id", rawId);
            return r;
          })
          .catch((e) => {
            console.error("[Brochure] getById failed:", rawId, e?.message);
            return null;
          })
      )
    );

    // Normalize, apply overrides, and resolve assets (companyLogo & main image inline)
    const normalizedList = [];
    for (const dbProp of rows) {
      if (!dbProp) continue;
      const base = normalize(dbProp);
      const p = applyOverrides(base);
      normalizedList.push(p);
    }

    // Resolve assets: company logo and footer logo to dataURL/absolute
    if (theme.companyLogo) {
      const logoDataUrl = await toDataUrlIfLocal(theme.companyLogo);
      theme.companyLogo = logoDataUrl || resolveAssetUrl(theme.companyLogo);
    }
    if (theme.footerLogo) {
      const footerDataUrl = await toDataUrlIfLocal(theme.footerLogo);
      theme.footerLogo = footerDataUrl || resolveAssetUrl(theme.footerLogo);
    }

    // Convert first photo to data URL / absolute for each property
    for (const p of normalizedList) {
      if (!p.assets) p.assets = {};
      if (!p.assets.mainImageDataUrl) {
        const first = Array.isArray(p.photos) && p.photos.length ? p.photos[0] : "";
        if (first) {
          const dataUrl = await toDataUrlIfLocal(first);
          if (dataUrl) p.assets.mainImageDataUrl = dataUrl;
          else p.assets.mainImageDataUrl = resolveAssetUrl(first);
        }
      }
    }

    const parts = [];
    const toc = [];

    normalizedList.forEach((p, i) => {
      console.log("[Brochure] Normalized property", p.id, {
        title: p.title,
        location: p.location,
        city: p.city,
        assigned_to: p.assigned_to || null,
        photosCount: Array.isArray(p.photos) ? p.photos.length : 0,
      });

      toc.push({ id: p.id, title: makeTitleText(p), location: computeLocationLine(p) });
      parts.push(sectionHtml(p, parts.length));
    });

    if (!parts.length) {
      return res.status(404).json({ success: false, message: "No valid properties found" });
    }

    const coverLogo =
      theme.companyLogo
        ? `<div style="margin-top:14px;"><img src="${esc(theme.companyLogo)}" alt="logo" style="max-height:48px; object-fit:contain;" /></div>`
        : "";
    if (theme.companyLogo) {
      console.log("[Brochure] Using companyLogo (cover):", theme.companyLogo.slice(0, 64), "...");
    } else {
      console.log("[Brochure] No companyLogo provided for cover");
    }
    if (theme.footerLogo) {
      console.log("[Brochure] Using footerLogo (header-pill side):", theme.footerLogo.slice(0, 64), "...");
    } else {
      console.log("[Brochure] No footerLogo provided for header");
    }

    const coverHtml = includeCover
      ? `<div class="cover-page">
           <div class="brand">ResaleExpert${coverLogo ? "" : ".in"}</div>
           ${coverLogo}
           <div class="title">Property Brochure Pack</div>
           <div class="subtitle">${parts.length} Properties • ${new Date().toLocaleDateString()}</div>
         </div>
         <div class="page-break"></div>`
      : "";

    const tocHtml = includeTOC
      ? `<div class="toc">
           <h2>Table of Contents</h2>
           <ol>${toc
             .map(
               (t, i) =>
                 `<li><span>${i + 1}.</span> <strong>${esc(t.title)}</strong> <em>${esc(t.location || "—")}</em></li>`
             )
             .join("")}</ol>
         </div>
         <div class="page-break"></div>`
      : "";

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Property Brochures</title>
<style>
  @page { size: A4; margin: 10mm 14mm 18mm 14mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Poppins", "Segoe UI", Roboto, Arial, sans-serif; margin:0; color:#111; }
  h2 { color:#111; font-size: 20px; margin: 0 0 10px; }
  h3 { font-size: 14px; margin: 0 0 8px 0; color:#111; }
  section { margin:10px 0 12px; }

  .header-card{
    display:flex; justify-content:space-between; align-items:flex-start;
    background: linear-gradient(135deg, ${theme.primary} 0%, #0b3856 100%);
    color:#fff; padding:8px 14px; border-radius:12px; box-shadow: 0 4px 14px rgba(0,0,0,.12);
    margin:0 0 10px 0; position:relative; overflow:hidden;
  }
  .header-card:before{
    content:''; position:absolute; inset:0;
    background: radial-gradient(1200px 300px at -5% -20%, rgba(255,255,255,.15), transparent 60%);
    pointer-events:none;
  }
  .header-left{ position:relative; z-index:1; max-width:76%; display:flex; align-items:flex-start; gap:10px; }
  .title-location-wrap { display: flex; flex-direction: column; gap: 4px; }
  .title-row{ font-weight:800; font-size:20px; line-height:1.3; margin:0; }
  .location-inline { font-size: 13px; font-weight: 500; opacity: 0.9; line-height: 1.3; }
  .id-pill {
    display: inline-block; background: linear-gradient(135deg, #0B3856 0%, #10507A 50%, #1373A3 100%);
    border: 1px solid rgba(11,56,86,0.6); color: #fff; font-weight: 700; font-size: 11px;
    padding: 3px 10px; border-radius: 999px; letter-spacing: .3px;
    box-shadow: 0 1px 2px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.2);
    -webkit-font-smoothing: antialiased; flex-shrink: 0; margin-top: 2px;
  }
  .header-right{ display:flex; gap:10px; align-items:center; z-index:1; }
  .badges{ display:flex; gap:8px; }
  .badge{ background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.24); color:#fff; font-weight:800; font-size:10px; padding:4px 10px; border-radius:999px; letter-spacing:.3px; }
  .logo-wrap img { max-height:24px; display:block; object-fit:contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,.25)); }

  .image-container { position: relative; width: 100%; margin: 10px 0 14px; }
  .cover { width:100%; height:260px; object-fit:cover; border-radius:10px; display:block; }
  .view-property-btn-overlay {
    position: absolute; bottom: 12px; right: 12px; background: linear-gradient(135deg, #0B3856 0%, #1373A3 100%);
    color: #fff; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all .3s;
  }
  .view-property-btn-overlay:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.4); }

  .price { display:flex; justify-content:space-between; align-items:flex-end; border:1px solid #E5E7EB; border-radius:10px; padding:10px 12px; background:linear-gradient(90deg,#F3F4F6,#EEF2FF); }
  .price .label { color:#6B7280; font-size:11px; }
  .price .value { font-size:16px; font-weight:600; }
  .price .priceVal { color:${theme.secondary}; font-size:20px; font-weight:700; }

  .stats { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin:12px 0; }
  .kv { display:flex; justify-content:space-between; border:1px dashed #E5E7EB; padding:8px 10px; border-radius:8px; font-size:12px; }

  .detailsGrid { display:grid; grid-template-columns: repeat(4, 1fr); gap:6px 10px; font-size:12px; }
  .k { color:#6B7280; margin-right:4px; }
  .v { font-weight:600; }
  .v.strong { font-weight:700; }
  .v.green { color:#059669; }
  .v.blue { color:#2563EB; }
  .v.orange { color:#EA580C; }

  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chips span { background:#E0E7FF; color:#4338CA; padding:4px 10px; border-radius:999px; font-size:11px; }
  .chips.purple span { background:#F3E8FF; color:#7C3AED; }

  .nearby { list-style:none; padding:0; margin:2px 0 0; }
  .nearby li { font-size:12px; color:#374151; margin:2px 0; }

  .invest { background:linear-gradient(90deg,#F5F3FF,#EFF6FF); border:1px solid #E5E7EB; border-radius:10px; padding:10px; }
  .contact-row { display:flex; gap:24px; flex-wrap:wrap; margin:16px 0; }
  .contact-item { display:flex; gap:6px; align-items:center; }
  .contact-item strong { color:#6b7280; font-size:14px; }
  .contact-item span { color:#1f2937; font-size:14px; }
  .contact-item a { color:#3b82f6; font-size:14px; text-decoration:none; }
  .contact-item a:hover { text-decoration: underline; }

  footer { text-align:center; margin-top:16px; font-size:11px; color:#9CA3AF; }

  .watermark { position:fixed; top:40%; left:0; right:0; text-align:center; opacity:0.06; font-size:80px; color:${theme.primary}; transform:rotate(-30deg); pointer-events:none; z-index:0; }
  .page-break { page-break-after:always; }
  .prop-section { position:relative; z-index:1; }

  .cover-page { display:flex; flex-direction:column; justify-content:center; align-items:center; height:85vh; text-align:center; }
  .cover-page .brand { font-size:18px; letter-spacing:2px; color:${theme.secondary}; text-transform:uppercase; }
  .cover-page .title { font-size:36px; font-weight:800; color:${theme.primary}; margin-top:10px; }
  .cover-page .subtitle { font-size:14px; color:#6B7280; margin-top:8px; }

  .toc { padding:0 6px; }
  .toc ol { margin:0; padding-left:18px; }
  .toc li { margin:4px 0; font-size:12px; }
  .toc li em { color:#6B7280; font-style:normal; margin-left:6px; }
</style>
</head>
<body>
  ${theme.watermark ? `<div class="watermark">ResaleExpert.in</div>` : ""}
  ${includeCover ? coverHtml : ""}
  ${includeTOC ? tocHtml : ""}
  ${parts.join("\n")}
</body>
</html>`;

    /* ------------------------------ PUPPETEER ------------------------------ */
    const tempFolder = path.join(__dirname, "../uploads/brochures");
    await fs.ensureDir(tempFolder);
    const outPath = path.join(tempFolder, `merged_${Date.now()}.pdf`);

    console.log("[Brochure] Launching Puppeteer...");
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.emulateMediaType("screen");

      // Log failing requests (useful when external http images/logos don’t load)
      page.on("requestfailed", (req) => {
        console.warn("[Brochure][requestfailed]", req.url(), req.failure()?.errorText);
      });
      page.on("console", (msg) => {
        try { console.log("[Brochure][page]", msg.type(), msg.text()); } catch {}
      });

      console.log("[Brochure] Setting HTML content...");
      await page.setContent(html, { waitUntil: ["domcontentloaded", "networkidle0"] });

      console.log("[Brochure] Generating PDF to:", outPath);
      await page.pdf({
        path: outPath,
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "14mm", bottom: "0mm", left: "14mm" },
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:8px; color:#6B7280; padding-left:12px; width:100%; text-align:left;"></div>`,
        footerTemplate: `<div style="width:100%; height:44px; background: linear-gradient(135deg, #0B3856 0%, #1373A3 100%); color:#fff; display:flex; flex-direction:row; justify-content:space-between; align-items:center; padding:0 30px; font-size:10px; margin:0; box-sizing:border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: 0 -3px 10px rgba(0,0,0,0.15); position:fixed; bottom:0; left:0; right:0;">
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" fill="#fff"/>
            </svg>
            <a href="tel:+918795748906" style="color:#fff; text-decoration:none; font-weight:700; font-size:14px; letter-spacing:0.3px;">
              +91 8795748906
            </a>
          </div>

          <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;">
              <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="2" fill="none"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#fff" stroke-width="2" fill="none"/>
            </svg>
            <a href="https://www.resaleexpert.in" style="color:#fff; text-decoration:none; font-weight:600; font-size:13px;">
              www.resaleexpert.in
            </a>
          </div>

          <div style="display:flex; flex-direction:row; align-items:center; gap:12px; flex:1; justify-content:flex-end;">
            <a href="https://www.instagram.com/resaleexpert.in/" aria-label="Instagram" style="width:22px; height:22px; display:inline-flex;">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
                <defs><linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#FD5949"/><stop offset="50%" style="stop-color:#D6249F"/><stop offset="100%" style="stop-color:#285AEB"/></linearGradient></defs>
                <path fill="url(#ig-grad)" d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.055 1.97.24 2.427.403.61.222 1.047.488 1.504.945.457.457.723.894.945 1.504.163.457.348 1.257.403 2.427.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.055 1.17-.24 1.97-.403 2.427a3.86 3.86 0 0 1-.945 1.504 3.86 3.86 0 0 1-1.504.945c-.457.163-1.257.348-2.427.403-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.055-1.97-.24-2.427-.403a3.86 3.86 0 0 1-1.504-.945 3.86 3.86 0 0 1-.945-1.504c-.163-.457-.348-1.257-.403-2.427C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.055-1.17.24-1.97.403-2.427.222-.61.488-1.047.945-1.504.457-.457.894-.723 1.504-.945.457-.163 1.257-.348 2.427-.403C8.416 2.175 8.796 2.163 12 2.163ZM12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324Zm6.406-1.244a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/>
              </svg>
            </a>
            <a href="https://www.facebook.com/resaleexpert.i" aria-label="Facebook" style="width:22px; height:22px; display:inline-flex;">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
                <path fill="#1877F2" d="M22.676 0H1.324C.593 0 0 .593 0 1.324v21.352C0 23.407.593 24 1.324 24H12.82v-9.294H9.692V11.06h3.127V8.41c0-3.1 1.892-4.79 4.658-4.79 1.325 0 2.463.099 2.796.143v3.242l-1.92.001c-1.505 0-1.797.716-1.797 1.767v2.318h3.59l-.467 3.646h-3.123V24h6.127C23.407 24 24 23.407 24 22.676V1.324C24 .593 23.407 0 22.676 0z"/>
              </svg>
            </a>
            <a href="https://www.youtube.com/channel/UCYuJPmp-d7HIdfPgSejWzvg" aria-label="YouTube" style="width:22px; height:22px; display:inline-flex;">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
                <path fill="#FF0000" d="M23.498 6.186a3.01 3.01 0 0 0-2.12-2.13C19.62 3.5 12 3.5 12 3.5s-7.62 0-9.378.556A3.01 3.01 0 0 0 .502 6.186 31.63 31.63 0 0 0 0 12a31.63 31.63 0 0 0 .502 5.814 3.01 3.01 0 0 0 2.12 2.13C4.38 20.5 12 20.5 12 20.5s7.62 0 9.378-.556a3.01 3.01 0 0 0 2.12-2.13A31.63 31.63 0 0 0 24 12a31.63 31.63 0 0 0-.502-5.814ZM9.75 15.568V8.432L15.818 12 9.75 15.568Z"/>
              </svg>
            </a>
          </div>
        </div>`,
      });

      console.log("[Brochure] PDF done:", outPath);
    } catch (err) {
      console.error("Bulk single PDF render error:", err);
      return res.status(500).json({ success: false, message: "Failed to render PDF" });
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log("[Brochure] Browser closed");
        } catch {}
      }
    }

    /* --------------------------------- STREAM -------------------------------- */
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const stream = fs.createReadStream(outPath);
    stream.on("open", () => console.log("[Brochure] Streaming:", outPath));
    stream.on("error", (e) => console.error("[Brochure] Read stream error:", e?.message));
    stream.on("close", async () => {
      console.log("[Brochure] Stream closed, cleaning up temp...");
      try {
        await fs.remove(outPath);
        console.log("[Brochure] Temp removed");
      } catch {}
    });
    stream.pipe(res);
  } catch (outerErr) {
    console.error("[Brochure] Uncaught error:", outerErr);
    res.status(500).json({ success: false, message: "Internal error generating brochure" });
  }
};




exports.generateBrochurePDF = async (req, res) => {
  const id = req.params.id;

  try {
    const dbProp = await Property.getById(id);
    if (!dbProp) {
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });
    }

    /* ------------ config from body ------------ */
    const sel = new Set(
      (req.body?.customizations?.selectedContent || []).filter(Boolean)
    );
    const theme = {
      primary: req.body?.customizations?.primaryColor || "#4F46E5",
      secondary: req.body?.customizations?.secondaryColor || "#10B981",
      font: req.body?.customizations?.fontStyle || "modern",
      layout: req.body?.customizations?.layout || "standard",
      watermark: Boolean(req.body?.customizations?.watermark ?? true),
    };
    const publicBaseUrl = String(req.body?.publicBaseUrl || "").replace(
      /\/+$/,
      ""
    );
    const fileName =
      (req.body?.fileName && String(req.body.fileName).trim()) ||
      `property-${id}-${Date.now()}.pdf`;

    /* ---------------- helpers ---------------- */
    const esc = (s = "") =>
      String(s).replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
      );
    const safe = (v, d = "—") =>
      v == null || (typeof v === "string" && v.trim() === "") ? d : v;
    const num = (v) => {
      if (v == null || v === "") return 0;
      const n = Number(String(v).replace(/[^\d.-]/g, ""));
      return Number.isNaN(n) ? 0 : n;
    };
    const currency = (val) => {
      const n = num(val);
      if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
      if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
      return `₹${n.toLocaleString("en-IN")}`;
    };
    const monthName = (m) => {
      const n = typeof m === "string" ? parseInt(m, 10) : m;
      if (!n || n < 1 || n > 12) return "";
      return new Date(0, n - 1).toLocaleString("en", { month: "long" });
    };
    const pickFirstStr = (...vals) =>
      vals
        .map((v) => (typeof v === "string" ? v : v == null ? "" : String(v)))
        .map((s) => s.trim())
        .find(Boolean) || "";
    const splitPrimaryAndCity = (s) => {
      const parts = s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        const city = parts[parts.length - 1];
        const primary = parts.slice(0, parts.length - 1).join(", ");
        return { primary, city };
      }
      return { primary: s.trim(), city: "" };
    };
    const toPhotoArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      if (typeof val === "string") {
        try {
          const arr = JSON.parse(val);
          if (Array.isArray(arr)) return arr.filter(Boolean);
        } catch {}
        if (val.includes(","))
          return val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        return [val.trim()].filter(Boolean);
      }
      return [];
    };
    const slugify = (s = "") =>
      s
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);

    /* ------------- normalize DB → p ------------- */
    const type = pickFirstStr(
      dbProp.type,
      dbProp.property_type,
      dbProp.propertyType,
      dbProp.property_type_name
    );
    const unitType = pickFirstStr(
      dbProp.unitType,
      dbProp.unit_type,
      dbProp.unitTypeName
    );
    const subtype = pickFirstStr(
      dbProp.subtype,
      dbProp.property_subtype_name,
      dbProp.propertySubtype
    );

    let locationNormalized = pickFirstStr(
      dbProp.locationNormalized,
      dbProp.location_normalized,
      dbProp.normalized_location
    );
    let location = pickFirstStr(
      dbProp.location,
      dbProp.location_name,
      dbProp.locality,
      dbProp.area,
      dbProp.neighbourhood,
      dbProp.address?.line1,
      dbProp.address_line1
    );
    let city = pickFirstStr(
      dbProp.city,
      dbProp.city_name,
      dbProp.town,
      dbProp.address?.city,
      dbProp.address_city
    );

    if (!locationNormalized) {
      const primary = location || "";
      locationNormalized =
        primary && city
          ? `${primary}, ${city}`
              .replace(/\s*,\s*/g, ", ")
              .replace(/\s{2,}/g, " ")
          : primary || city || "";
    }
    if (!city && locationNormalized) {
      const { primary, city: inferredCity } =
        splitPrimaryAndCity(locationNormalized);
      if (inferredCity) {
        city = inferredCity;
        if (!location) location = primary;
      }
    }

    const p = {
      id: dbProp.id ?? dbProp.property_id ?? dbProp.propertyId,
      propertyId: dbProp.propertyId ?? dbProp.property_id ?? dbProp.id,
      slug: pickFirstStr(dbProp.slug, dbProp.property_slug, dbProp.seo_slug),
      title: dbProp.title || dbProp.society_name || "",
      location,
      locationNormalized,
      city,
      type,
      unitType,
      subtype,
      carpetArea:
        dbProp.carpetArea || dbProp.carpet_area || dbProp.square_feet || "",
      price: dbProp.price || dbProp.final_price || dbProp.budget || 0,
      bedrooms: dbProp.bedrooms ?? dbProp.bhk ?? "",
      bathrooms: dbProp.bathrooms ?? dbProp.bath ?? "",
      parking: dbProp.parking ?? "",
      furnishing: dbProp.furnishing || "",
      possessionMonth: dbProp.possessionMonth || dbProp.possession_month || "",
      possessionYear:
        dbProp.possessionYear ||
        dbProp.possession_year ||
        dbProp.built_year ||
        "",
      facing: dbProp.facing || "",
      builtYear: dbProp.builtYear || dbProp.built_year || "",
      verified: Boolean(dbProp.verified),
      featured: Boolean(dbProp.featured),
      views: dbProp.views ?? "",
      listedDays: dbProp.listedDays ?? "",
      aiScore: dbProp.aiScore ?? "",
      priceGrowth: dbProp.priceGrowth ?? "",
      investmentGrade: dbProp.investmentGrade ?? "",
      description: dbProp.description || dbProp.details || "",
      photos: toPhotoArray(dbProp.photos || dbProp.images),
      amenities: Array.isArray(dbProp.amenities)
        ? dbProp.amenities
        : dbProp.amenities
        ? [dbProp.amenities]
        : [],
      furnishingItems: Array.isArray(dbProp.furnishingItems)
        ? dbProp.furnishingItems
        : [],
      agent: {
        name: dbProp.agent_name || dbProp.seller_name || "",
        phone:
          dbProp.agent_phone ||
          dbProp.seller_phone ||
          dbProp.seller?.phone ||
          "",
      },
      raw: {
        floor: dbProp.floor,
        totalFloors: dbProp.total_floors || dbProp.totalFloors,
        wing: dbProp.wing,
        unitNo: dbProp.unit_no || dbProp.unitNo,
        nearby_places: dbProp.nearby_places || [],
      },
    };

    /* ------------- derived values ------------- */
    const show = (key) => sel.has(key); // still used for other sections
    const makeTitleText = (prop) => {
      const parts = [prop.type, prop.unitType, prop.subtype]
        .map((s) => (s || "").trim())
        .filter(Boolean);
      return parts.join(" ") || prop.title || "Property";
    };
    const computeLocationLine = (prop) => {
      const primaryRaw = prop.locationNormalized || prop.location || "";
      const cityRaw = prop.city || "";
      const primary = primaryRaw.trim();
      const cityStr = cityRaw.trim();
      if (!primary && !cityStr) return "";
      if (!primary) return cityStr;
      if (!cityStr) return primary;
      if (primary.toLowerCase().includes(cityStr.toLowerCase())) return primary;
      return `${primary}, ${cityStr}`;
    };
    const composedTitle = `${makeTitleText(p)}`;
    const locationLine = computeLocationLine(p);

    const buildDeepUrl = () => {
      if (!show("propertyUrl")) return "";
      if (!publicBaseUrl) return "";
      const slug =
        p.slug ||
        slugify(
          `${p.type || ""}-${p.unitType || ""}-${p.title || ""}-${p.city || ""}`
        );
      const suffix = slug || p.id || "";
      return `${publicBaseUrl}/properties/${suffix}`;
    };
    const deepUrl = buildDeepUrl();

    /* ---------------- HTML blocks ---------------- */
    const images = p.photos.length
      ? p.photos
      : ["https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg"];
    const mainImage = images[0];

    const pricePerSqFt =
      p.price && p.carpetArea
        ? Math.round(num(p.price) / Math.max(1, num(p.carpetArea)))
        : null;

    // Header card
    const headerBlock = `
      <section class="header-card">
        <div class="header-left">
          <span class="id-pill">#${p.id}</span>
          <div class="title-location-wrap">
            <div class="title-row">${esc(composedTitle)}</div>
            ${
              locationLine && show("location")
                ? `<div class="location-inline">${esc(locationLine)}</div>`
                : ""
            }
          </div>
        </div>
        <div class="header-right">
          <div class="badges">
            ${p.featured ? `<span class="badge featured">FEATURED</span>` : ""}
            ${p.verified ? `<span class="badge verified">VERIFIED</span>` : ""}
          </div>
        </div>
      </section>`;

    const imageBlock = show("mainImage")
      ? `<div class="image-container">
           <img class="cover" src="${esc(mainImage)}" alt="cover" />
           ${
             deepUrl
               ? `<a href="${esc(
                   deepUrl
                 )}" class="view-property-btn-overlay">View Property →</a>`
               : ""
           }
         </div>`
      : "";

    const priceBlock = show("price")
      ? `<section class="price">
           <div class="left">
             <div class="label">Property Price</div>
             <div class="value priceVal" style="color: green;">${currency(
               p.price
             )}</div>
           </div>
           ${
             pricePerSqFt
               ? `<div class="right"><div class="label">Per Sq Ft</div><div class="value" style="color: green;">₹${pricePerSqFt.toLocaleString(
                   "en-IN"
                 )}</div></div>`
               : ""
           }
         </section>`
      : "";

    /* ----- STATS: force one row with 4 items (always visible) ----- */
    const statsBlock = `
      <section class="stats stats-4">
        <div class="kv"><span>Bedrooms</span><span>${esc(
          safe(p.bedrooms)
        )}</span></div>
        <div class="kv"><span>Bathrooms</span><span>${esc(
          safe(p.bathrooms)
        )}</span></div>
        <div class="kv"><span>Parking</span><span>${esc(
          safe(p.parking)
        )}</span></div>
        <div class="kv"><span>Carpet Area</span><span>${
          p.carpetArea ? `${esc(safe(p.carpetArea))} sq ft` : "—"
        }</span></div>
      </section>`;

    const descriptionBlock =
      show("description") && p.description
        ? `<section><h3>About Property</h3><p>${esc(
            p.description
          )}</p></section>`
        : "";

    const detailItems = [];
    if (show("furnishing"))
      detailItems.push(
        `<div><span class="k">Furnishing:</span><span class="v">${esc(
          safe(p.furnishing)
        )}</span></div>`
      );
    if (show("possession") && (p.possessionMonth || p.possessionYear)) {
      const pos = [monthName(p.possessionMonth), p.possessionYear]
        .filter(Boolean)
        .join(" ");
      detailItems.push(
        `<div><span class="k">Possession:</span><span class="v">${esc(
          pos || "—"
        )}</span></div>`
      );
    }
    if (show("facing"))
      detailItems.push(
        `<div><span class="k">Facing:</span><span class="v">${esc(
          safe(p.facing)
        )}</span></div>`
      );
    if (show("builtYear"))
      detailItems.push(
        `<div><span class="k">Built Year:</span><span class="v">${esc(
          safe(p.builtYear || p.possessionYear)
        )}</span></div>`
      );
    if (show("floor") && (p.raw.floor || p.raw.totalFloors)) {
      const f =
        p.raw.floor && p.raw.totalFloors
          ? `${p.raw.floor} / ${p.raw.totalFloors}`
          : p.raw.floor ?? "—";
      detailItems.push(
        `<div><span class="k">Floor:</span><span class="v">${esc(
          f
        )}</span></div>`
      );
    }
    if (show("wing") && p.raw.wing)
      detailItems.push(
        `<div><span class="k">Wing:</span><span class="v">${esc(
          p.raw.wing
        )}</span></div>`
      );
    if (show("unitNo") && p.raw.unitNo)
      detailItems.push(
        `<div><span class="k">Unit No:</span><span class="v">${esc(
          p.raw.unitNo
        )}</span></div>`
      );
    const detailsBlock = detailItems.length
      ? `<section><h3>Property Details</h3><div class="detailsGrid details-4">${detailItems.join(
          ""
        )}</div></section>`
      : "";

    const amenitiesBlock =
      show("amenities") && Array.isArray(p.amenities) && p.amenities.length
        ? `<section><h3>Amenities</h3><div class="chips">${p.amenities
            .slice(0, 12)
            .map((a) => `<span>${esc(a)}</span>`)
            .join("")}</div></section>`
        : "";

    const furnishingItemsBlock =
      show("furnishingItems") &&
      Array.isArray(p.furnishingItems) &&
      p.furnishingItems.length
        ? `<section><h3>Furnishing Items</h3><div class="chips purple">${p.furnishingItems
            .slice(0, 12)
            .map((a) => `<span>${esc(a)}</span>`)
            .join("")}</div></section>`
        : "";

    const nearbyBlock =
      show("nearbyPlaces") &&
      Array.isArray(p.raw.nearby_places) &&
      p.raw.nearby_places.length
        ? `<section><h3>Nearby Places</h3><ul class="nearby">
            ${p.raw.nearby_places
              .slice(0, 6)
              .map(
                (pl) =>
                  `<li>• ${esc(pl.name || "")} ${
                    pl.distance
                      ? `(${esc(pl.distance)}${esc(pl.unit || "")})`
                      : ""
                  }</li>`
              )
              .join("")}
           </ul></section>`
        : "";

    const investItems = [];
    if (show("aiScore"))
      investItems.push(
        `<div><span class="k">AI Score:</span><span class="v strong">${esc(
          safe(p.aiScore || "94")
        )}/100</span></div>`
      );
    if (show("priceGrowth"))
      investItems.push(
        `<div><span class="k">Growth:</span><span class="v strong green">${esc(
          safe(p.priceGrowth || "+12.5%")
        )}</span></div>`
      );
    if (show("investmentGrade"))
      investItems.push(
        `<div><span class="k">Investment:</span><span class="v strong blue">${esc(
          safe(p.investmentGrade || "A+")
        )}</span></div>`
      );
    const investmentBlock = investItems.length
      ? `<section class="invest"><h3>AI Investment Analysis</h3><div class="detailsGrid details-4">${investItems.join(
          ""
        )}</div></section>`
      : "";

    const activityItems = [];
    if (show("views"))
      activityItems.push(
        `<div class="kv"><span>Total Views</span><span>${esc(
          safe(p.views)
        )}</span></div>`
      );
    if (show("listedDays"))
      activityItems.push(
        `<div class="kv"><span>Listed</span><span>${
          p.listedDays ? `${esc(p.listedDays)} days ago` : "—"
        }</span></div>`
      );
    const activityBlock = activityItems.length
      ? `<section><h3>Property Activity</h3><div class="stats stats-4">${activityItems.join(
          ""
        )}</div></section>`
      : "";

    const contactBlock =
      show("agentInfo") || show("contactDetails")
        ? `<section class="contact"><h3>Contact</h3>
             ${
               show("agentInfo") && p.agent.name
                 ? `<div><strong>Agent:</strong> ${esc(p.agent.name)}</div>`
                 : ""
             }
             ${
               show("contactDetails") && p.agent.phone
                 ? `<div><strong>Phone:</strong> ${esc(p.agent.phone)}</div>`
                 : ""
             }
           </section>`
        : "";

    const watermarkBlock = theme.watermark
      ? `<footer>Powered by ResaleExpert • Generated on ${new Date().toLocaleDateString()}</footer>`
      : "";

    /* ----------------- full HTML ----------------- */
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(makeTitleText(p))}</title>
<style>
  @page { size: A4; margin: 10mm 14mm 18mm 14mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Poppins", "Segoe UI", Roboto, Arial, sans-serif; margin:0; color:#111; }
  h3 { font-size: 14px; margin: 0 0 8px 0; color:#111; }
  section { margin:10px 0 12px; }

  /* Header card */
  .header-card{
    display:flex; justify-content:space-between; align-items:flex-start;
    background: linear-gradient(135deg, ${theme.primary} 0%, #0b3856 100%);
    color:#fff; padding:8px 14px; border-radius:12px; box-shadow: 0 4px 14px rgba(0,0,0,.12);
    margin:0 0 10px 0; position:relative; overflow:hidden;
  }
  .header-card:before{
    content:''; position:absolute; inset:0;
    background: radial-gradient(1200px 300px at -5% -20%, rgba(255,255,255,.15), transparent 60%);
    pointer-events:none;
  }
  .header-left{ position:relative; z-index:1; max-width:76%; display:flex; align-items:flex-start; gap:10px; }
  .title-location-wrap { display: flex; flex-direction: column; gap: 4px; }
  .title-row{ font-weight:800; font-size:20px; line-height:1.3; margin:0; }
  .location-inline { font-size: 13px; font-weight: 500; opacity: 0.9; line-height: 1.3; }
  .id-pill {
    display: inline-block;
    background: linear-gradient(135deg, #0B3856 0%, #10507A 50%, #1373A3 100%);
    border: 1px solid rgba(11, 56, 86, 0.6);
    color: #FFFFFF;
    font-weight: 700;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 999px;
    letter-spacing: 0.3px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    -webkit-font-smoothing: antialiased;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .header-right{ display:flex; gap:8px; z-index:1; }
  .badges{ display:flex; gap:8px; }
  .badge{ background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.24); color:#fff; font-weight:800; font-size:10px; padding:4px 10px; border-radius:999px; letter-spacing:.3px; }

  /* Image container with overlay button */
  .image-container { position: relative; width: 100%; margin: 10px 0 14px; }
  .cover { width:100%; height:260px; object-fit:cover; border-radius:10px; display: block; }
  .view-property-btn-overlay {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: linear-gradient(135deg, #0B3856 0%, #1373A3 100%);
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: all 0.3s;
  }
  .view-property-btn-overlay:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.4); }

  .price { display:flex; justify-content:space-between; align-items:flex-end; border:1px solid #E5E7EB; border-radius:10px; padding:10px 12px; background:linear-gradient(90deg,#F3F4F6,#EEF2FF); }
  .price .label { color:#6B7280; font-size:11px; }
  .price .value { font-size:16px; font-weight:600; }
  .price .priceVal { color:${
    theme.secondary
  }; font-size:20px; font-weight:700; }

  /* one row, 4 columns for stats */
  .stats.stats-4 { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin:12px 0; }
  .kv { display:flex; justify-content:space-between; border:1px dashed #E5E7EB; padding:8px 10px; border-radius:8px; font-size:12px; }

  /* property details: 4 columns */
  .detailsGrid.details-4 { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px 12px; font-size:12px; }
  .k { color:#6B7280; margin-right:6px; }
  .v { font-weight:600; }
  .v.strong { font-weight:700; }
  .v.green { color:#059669; }
  .v.blue { color:#2563EB; }
  .v.orange { color:#EA580C; }

  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chips span { background:#E0E7FF; color:#4338CA; padding:4px 10px; border-radius:999px; font-size:11px; }
  .chips.purple span { background:#F3E8FF; color:#7C3AED; }

  .nearby { list-style:none; padding:0; margin:2px 0 0; }
  .nearby li { font-size:12px; color:#374151; margin:2px 0; }

  .invest { background:linear-gradient(90deg,#F5F3FF,#EFF6FF); border:1px solid #E5E7EB; border-radius:10px; padding:10px; }
  .contact { border:1px solid #E5E7EB; border-radius:10px; padding:10px; }

  footer { text-align:center; margin-top:16px; font-size:11px; color:#9CA3AF; }

  .watermark { position:fixed; top:40%; left:0; right:0; text-align:center; opacity:0.06; font-size:80px; color:${
    theme.primary
  }; transform:rotate(-30deg); pointer-events:none; z-index:0; }
</style>
</head>
<body>
  ${theme.watermark ? `<div class="watermark">ResaleExpert.in</div>` : ""}
  <div class="container">
    ${headerBlock}
    ${imageBlock}
    ${priceBlock}
    ${statsBlock}
    ${descriptionBlock}
    ${detailsBlock}
    ${amenitiesBlock}
    ${furnishingItemsBlock}
    ${nearbyBlock}
    ${investmentBlock}
    ${activityBlock}
    ${contactBlock}
    ${watermarkBlock}
  </div>
</body>
</html>`;

    /* ------------- render PDF with gradient footer ------------- */
    const folder = path.join(__dirname, "../uploads/brochures");
    await fs.ensureDir(folder);
    const outPath = path.join(folder, `property_${p.id}_${Date.now()}.pdf`);

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.emulateMediaType("screen");
      await page.setContent(html, {
        waitUntil: ["domcontentloaded", "networkidle0"],
      });
      await page.pdf({
        path: outPath,
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "14mm", bottom: "0mm", left: "14mm" },
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:8px; color:#6B7280; padding-left:12px; width:100%; text-align:left;"></div>`,
        footerTemplate: `<div style="width:100%; height:44px; background: linear-gradient(135deg, #0B3856 0%, #1373A3 100%); color:#fff; display:flex; flex-direction:row; justify-content:space-between; align-items:center; padding:0 30px; font-size:10px; margin:0; box-sizing:border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: 0 -3px 10px rgba(0,0,0,0.15); position:fixed; bottom:0; left:0; right:0;">
          <div style="display:flex; align-items:center; gap:8px; flex:1;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" fill="#fff"/>
            </svg>
            <a href="tel:+918795748906" style="color:#fff; text-decoration:none; font-weight:700; font-size:14px; letter-spacing:0.3px;">+91 879574896</a>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;">
              <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="2" fill="none"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#fff" stroke-width="2" fill="none"/>
            </svg>
            <a href="https://www.resaleexpert.in" style="color:#fff; text-decoration:none; font-weight:600; font-size:13px;">www.resaleexpert.in</a>
          </div>
          <div style="display:flex; flex-direction:row; align-items:center; gap:12px; flex:1; justify-content:flex-end;">
             <a href="https://www.instagram.com/resaleexpert.in/"
     aria-label="Instagram"
     style="width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
      <defs>
        <linearGradient id="ig-grad-dark" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#B03024"/>      <!-- darker red -->
          <stop offset="50%" style="stop-color:#8B1C70"/>    <!-- darker magenta -->
          <stop offset="100%" style="stop-color:#1C3C9B"/>   <!-- darker blue -->
        </linearGradient>
      </defs>
      <path fill="url(#ig-grad-dark)" d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.055 1.97.24 2.427.403.61.222 1.047.488 1.504.945.457.457.723.894.945 1.504.163.457.348 1.257.403 2.427.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.055 1.17-.24 1.97-.403 2.427a3.86 3.86 0 0 1-.945 1.504 3.86 3.86 0 0 1-1.504.945c-.457.163-1.257.348-2.427.403-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.055-1.97-.24-2.427-.403a3.86 3.86 0 0 1-1.504-.945 6.27 6.27 0 0 0-1.4-2.153c-.295-.774-.49-1.657-.548-2.937C-.043 8.39-.057 8.8-.057 12s.014 3.61.072 4.889c.058 1.28.253 2.163.548 2.937.31.8.724 1.477 1.4 2.153.774.295 1.657.49 2.937.548C8.39 23.957 8.8 23.971 12 23.971s3.61-.014 4.889-.072c1.28-.058 2.163-.253 2.937-.548a6.27 6.27 0 0 0 2.153-1.4 6.27 6.27 0 0 0 1.4-2.153c.295-.774.49-1.657.548-2.937.058-1.279.072-1.689.072-4.889s-.014-3.61-.072-4.889c-.058-1.28-.253-2.163-.548-2.937a6.27 6.27 0 0 0-1.4-2.153 6.27 6.27 0 0 0-2.153-1.4c-.774-.295-1.657-.49-2.937-.548C15.61.014 15.2 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324Zm6.406-1.244a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/>
    </svg>
  </a>

  <!-- Facebook -->
  <a href="https://www.facebook.com/resaleexpert.i"
     aria-label="Facebook"
     style="width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:90%; height:90%;">
      <path fill="#0D3C80" d="M22.676 0H1.324C.593 0 0 .593 0 1.324v21.352C0 23.407.593 24 1.324 24H12.82v-9.294H9.692V11.06h3.127V8.41c0-3.1 1.892-4.79 4.658-4.79 1.325 0 2.463.099 2.796.143v3.242l-1.92.001c-1.505 0-1.797.716-1.797 1.767v2.318h3.59l-.467 3.646h-3.123V24h6.127C23.407 24 24 23.407 24 22.676V1.324C24 .593 23.407 0 22.676 0z"/>
    </svg>
  </a>
            <a href="https://www.youtube.com/channel/UCYuJPmp-d7HIdfPgSejWzvg" aria-label="YouTube" style="width:22px; height:22px; display:inline-flex;">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;"><path fill="#FF0000" d="M23.498 6.186a3.01 3.01 0 0 0-2.12-2.13C19.62 3.5 12 3.5 12 3.5s-7.62 0-9.378.556A3.01 3.01 0 0 0 .502 6.186 31.63 31.63 0 0 0 0 12a31.63 31.63 0 0 0 .502 5.814 3.01 3.01 0 0 0 2.12 2.13C4.38 20.5 12 20.5 12 20.5s7.62 0 9.378-.556a3.01 3.01 0 0 0 2.12-2.13A31.63 31.63 0 0 0 24 12a31.63 31.63 0 0 0-.502-5.814ZM9.75 15.568V8.432L15.818 12 9.75 15.568Z"/></svg>
            </a>
          </div>
        </div>`,
      });
    } catch (err) {
      console.error("Single PDF render error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to render PDF" });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
    }

    // stream + cleanup
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    fs.createReadStream(outPath)
      .on("close", async () => {
        try {
          await fs.remove(outPath);
        } catch {}
      })
      .pipe(res);
  } catch (err) {
    console.error("Error generating brochure:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate brochure" });
  }
};

// controllers/propertyBrochure.controller.js (excerpt)

