// controllers/propertyBrochure.controller.js
const Property = require("../models/Property");
const path = require("path");
const fs = require("fs-extra");
const puppeteer = require("puppeteer");

/**
 * POST /properties/:id/brochure
 * Body: {
 *   template: 'premium' | 'modern' | ...,
 *   customizations: { primaryColor, secondaryColor, fontStyle, layout, watermark, selectedContent: string[] },
 *   property?: {} (optional — ignored if DB has canonical)
 * }
 */
exports.generateBrochurePDF = async (req, res) => {
  const id = req.params.id;

  try {
    const dbProp = await Property.getById(id);
    if (!dbProp) {
      return res
        .status(404)
        .json({ success: false, message: "Property not found" });
    }

    // selections from frontend
    const sel = new Set(
      (req.body?.customizations?.selectedContent || []).filter(Boolean)
    );

    // theming
    const theme = {
      primary: req.body?.customizations?.primaryColor || "#4F46E5",
      secondary: req.body?.customizations?.secondaryColor || "#10B981",
      font: req.body?.customizations?.fontStyle || "modern",
      layout: req.body?.customizations?.layout || "standard",
      watermark: Boolean(req.body?.customizations?.watermark ?? true),
    };

    const template = String(req.body?.template || "premium");

    // --- helpers ---
    const safe = (v, d = "—") =>
      v === null ||
      v === undefined ||
      (typeof v === "string" && v.trim() === "")
        ? d
        : v;

    const num = (v) => {
      if (v === null || v === undefined || v === "") return 0;
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

    // --- normalize DB property to UI-ish shape (support both notations) ---
    const p = {
      id: dbProp.id,
      title: dbProp.title || dbProp.society_name || "Property",
      location: dbProp.location || dbProp.location_name || "",
      city: dbProp.city || dbProp.city_name || "",
      type: dbProp.type || dbProp.property_type || "",
      unitType: dbProp.unitType || dbProp.unit_type || "",
      subtype: dbProp.subtype || "",
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
      photos: Array.isArray(dbProp.photos)
        ? dbProp.photos
        : dbProp.photos
        ? [dbProp.photos]
        : [],
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

    const images =
      p.photos && p.photos.length > 0
        ? p.photos
        : [
            "https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg",
          ];
    const mainImage = images[0];

    // price per sq ft
    const pricePerSqFt =
      p.price && p.carpetArea
        ? Math.round(num(p.price) / Math.max(1, num(p.carpetArea)))
        : null;

    // --- blocks (conditional) ---
    const show = (key) => sel.has(key);

    const headerBlock =
      show("propertyType") ||
      show("location") ||
      show("verified") ||
      show("featured")
        ? `
      <section class="header">
        ${
          show("propertyType")
            ? `<h1>${
                [p.type, p.unitType, p.subtype].filter(Boolean).join(" • ") ||
                p.title
              }</h1>`
            : ""
        }
        ${
          show("location")
            ? `<div class="location">${[p.location, p.city]
                .filter(Boolean)
                .join(", ")}</div>`
            : ""
        }
        <div class="badges">
          ${
            show("featured") && p.featured
              ? `<span class="featured">FEATURED</span>`
              : ""
          }
          ${
            show("verified") && p.verified
              ? `<span class="verified">VERIFIED</span>`
              : ""
          }
        </div>
      </section>`
        : "";

    const mainImageBlock = show("mainImage")
      ? `<img class="cover" src="${mainImage}" alt="cover" />`
      : "";

    const priceBlock = show("price")
      ? `
      <section class="price">
        <div class="left">
          <div class="label">Property Price</div>
          <div class="value priceVal">${currency(p.price)}</div>
        </div>
        ${
          pricePerSqFt
            ? `
          <div class="right">
            <div class="label">Per Sq Ft</div>
            <div class="value">₹${pricePerSqFt.toLocaleString("en-IN")}</div>
          </div>`
            : ""
        }
      </section>`
      : "";

    const stats = [];
    if (show("bedrooms"))
      stats.push(
        `<div class="kv"><span>Bedrooms</span><span>${safe(
          p.bedrooms
        )}</span></div>`
      );
    if (show("bathrooms"))
      stats.push(
        `<div class="kv"><span>Bathrooms</span><span>${safe(
          p.bathrooms
        )}</span></div>`
      );
    if (show("parking"))
      stats.push(
        `<div class="kv"><span>Parking</span><span>${safe(
          p.parking
        )}</span></div>`
      );
    if (show("carpetArea"))
      stats.push(
        `<div class="kv"><span>Carpet Area</span><span>${safe(
          p.carpetArea
        )} sq ft</span></div>`
      );
    const statsBlock = stats.length
      ? `<section class="stats">${stats.join("")}</section>`
      : "";

    const descriptionBlock =
      show("description") && p.description
        ? `<section><h3>About Property</h3><p>${p.description}</p></section>`
        : "";

    // details grid
    const detailItems = [];
    if (show("furnishing"))
      detailItems.push(
        `<div><span class="k">Furnishing:</span><span class="v">${safe(
          p.furnishing
        )}</span></div>`
      );
    if (show("possession") && (p.possessionMonth || p.possessionYear)) {
      const pos = [monthName(p.possessionMonth), p.possessionYear]
        .filter(Boolean)
        .join(" ");
      detailItems.push(
        `<div><span class="k">Possession:</span><span class="v">${
          pos || "—"
        }</span></div>`
      );
    }
    if (show("facing"))
      detailItems.push(
        `<div><span class="k">Facing:</span><span class="v">${safe(
          p.facing
        )}</span></div>`
      );
    if (show("builtYear"))
      detailItems.push(
        `<div><span class="k">Built Year:</span><span class="v">${safe(
          p.builtYear || p.possessionYear
        )}</span></div>`
      );
    if (show("floor") && (p.raw.floor || p.raw.totalFloors)) {
      const f =
        p.raw.floor && p.raw.totalFloors
          ? `${p.raw.floor} / ${p.raw.totalFloors}`
          : p.raw.floor ?? "—";
      detailItems.push(
        `<div><span class="k">Floor:</span><span class="v">${f}</span></div>`
      );
    }
    if (show("wing") && p.raw.wing)
      detailItems.push(
        `<div><span class="k">Wing:</span><span class="v">${p.raw.wing}</span></div>`
      );
    if (show("unitNo") && p.raw.unitNo)
      detailItems.push(
        `<div><span class="k">Unit No:</span><span class="v">${p.raw.unitNo}</span></div>`
      );
    const detailsBlock = detailItems.length
      ? `
      <section>
        <h3>Property Details</h3>
        <div class="detailsGrid">${detailItems.join("")}</div>
      </section>`
      : "";

    const amenitiesBlock =
      show("amenities") && Array.isArray(p.amenities) && p.amenities.length
        ? `<section><h3>Amenities</h3><div class="chips">${p.amenities
            .slice(0, 12)
            .map((a) => `<span>${a}</span>`)
            .join("")}</div></section>`
        : "";

    const furnishingItemsBlock =
      show("furnishingItems") &&
      Array.isArray(p.furnishingItems) &&
      p.furnishingItems.length
        ? `<section><h3>Furnishing Items</h3><div class="chips purple">${p.furnishingItems
            .slice(0, 12)
            .map((a) => `<span>${a}</span>`)
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
                 `<li>• ${pl.name || ""} ${
                   pl.distance ? `(${pl.distance}${pl.unit || ""})` : ""
                 }</li>`
             )
             .join("")}
         </ul></section>`
        : "";

    const investItems = [];
    if (show("aiScore"))
      investItems.push(
        `<div><span class="k">AI Score:</span><span class="v strong">${safe(
          p.aiScore || "94"
        )}/100</span></div>`
      );
    if (show("priceGrowth"))
      investItems.push(
        `<div><span class="k">Growth:</span><span class="v strong green">${safe(
          p.priceGrowth || "+12.5%"
        )}</span></div>`
      );
    if (show("investmentGrade"))
      investItems.push(
        `<div><span class="k">Investment:</span><span class="v strong blue">${safe(
          p.investmentGrade || "A+"
        )}</span></div>`
      );
    if (show("roiPotential"))
      investItems.push(
        `<div><span class="k">ROI Potential:</span><span class="v strong orange">18.2%</span></div>`
      );
    if (show("marketPosition"))
      investItems.push(
        `<div><span class="k">Market:</span><span class="v strong purple">Top 10%</span></div>`
      );
    const investmentBlock = investItems.length
      ? `
      <section class="invest">
        <h3>AI Investment Analysis</h3>
        <div class="detailsGrid">${investItems.join("")}</div>
      </section>`
      : "";

    const activityItems = [];
    if (show("views"))
      activityItems.push(
        `<div class="kv"><span>Total Views</span><span>${safe(
          p.views
        )}</span></div>`
      );
    if (show("listedDays"))
      activityItems.push(
        `<div class="kv"><span>Listed</span><span>${
          p.listedDays ? `${p.listedDays} days ago` : "—"
        }</span></div>`
      );
    const activityBlock = activityItems.length
      ? `<section><h3>Property Activity</h3><div class="stats">${activityItems.join(
          ""
        )}</div></section>`
      : "";

    const contactBlock =
      show("agentInfo") || show("contactDetails")
        ? `
      <section class="contact">
        <h3>Contact</h3>
        ${
          show("agentInfo") && p.agent.name
            ? `<div><strong>Agent:</strong> ${p.agent.name}</div>`
            : ""
        }
        ${
          show("contactDetails") && p.agent.phone
            ? `<div><strong>Phone:</strong> ${p.agent.phone}</div>`
            : ""
        }
      </section>`
        : "";

    const watermarkBlock = theme.watermark
      ? `<footer>Powered by ResaleExpert • Generated on ${new Date().toLocaleDateString()}</footer>`
      : "";

    // --- HTML template ---
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${p.title}</title>
<style>
  @page { size: A4; margin: 18mm 14mm 18mm 14mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Poppins", "Segoe UI", Roboto, Arial, sans-serif; margin:0; color:#111; }
  .container { padding: 0; }
  h1 { color: ${theme.primary}; font-size: 26px; margin: 0 0 4px 0; }
  h3 { font-size: 14px; margin: 0 0 8px 0; color:#111; }
  .location { color:#6B7280; margin: 2px 0 8px; }
  .badges { display:flex; gap:8px; }
  .featured { background: linear-gradient(45deg,#F59E0B,#EF4444); color:#fff; font-weight:700; font-size:10px; padding:4px 10px; border-radius:999px; }
  .verified { background:#10B981; color:#fff; font-weight:700; font-size:10px; padding:4px 10px; border-radius:999px; }
  .cover { width:100%; height: 260px; object-fit:cover; border-radius:10px; margin: 10px 0 14px; }
  .price { display:flex; justify-content:space-between; align-items:flex-end; border:1px solid #E5E7EB; border-radius:10px; padding:10px 12px; background:linear-gradient(90deg,#F3F4F6,#EEF2FF); }
  .price .label { color:#6B7280; font-size:11px; }
  .price .value { font-size:16px; font-weight:600; }
  .price .priceVal { color:${
    theme.secondary
  }; font-size:20px; font-weight:700; }
  .stats { display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin: 12px 0; }
  .kv { display:flex; justify-content:space-between; border:1px dashed #E5E7EB; padding:8px 10px; border-radius:8px; font-size:12px; }
  section { margin: 10px 0 12px; }
  .detailsGrid { display:grid; grid-template-columns: 1fr 1fr; gap:6px 14px; font-size:12px; }
  .k { color:#6B7280; margin-right:6px; }
  .v { font-weight:600; }
  .v.strong { font-weight:700; }
  .v.green { color:#059669; }
  .v.blue { color:#2563EB; }
  .v.orange { color:#EA580C; }
  .v.purple { color:#7C3AED; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chips span { background:#E0E7FF; color:#4338CA; padding:4px 10px; border-radius:999px; font-size:11px; }
  .chips.purple span { background:#F3E8FF; color:#7C3AED; }
  .nearby { list-style:none; padding:0; margin: 2px 0 0; }
  .nearby li { font-size:12px; color:#374151; margin: 2px 0; }
  .invest { background: linear-gradient(90deg, #F5F3FF, #EFF6FF); border:1px solid #E5E7EB; border-radius:10px; padding:10px; }
  .contact { border:1px solid #E5E7EB; border-radius:10px; padding:10px; }
  footer { text-align:center; margin-top:16px; font-size:11px; color:#9CA3AF; }
  .header { margin-bottom: 8px; }
   .watermark {
    position: fixed;
    top: 40%;
    left: 0;
    right: 0;
    text-align: center;
    opacity: 0.08; /* light */
    font-size: 80px;
    color: #4F46E5; /* same as theme.primary */
    transform: rotate(-30deg);
    pointer-events: none;
    z-index: 0;
  }
</style>
</head>
<body>
  ${theme.watermark ? `<div class="watermark">ResaleExpert.in</div>` : ""}
  <div class="container">
    ${headerBlock}
    ${mainImageBlock}
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

    // output directory
    const folder = path.join(__dirname, "../uploads/brochures");
    await fs.ensureDir(folder);
    const filePath = path.join(folder, `property_${p.id}.pdf`);

    // Puppeteer
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle2" });

    await page.pdf({
      path: filePath,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="property_${p.id}.pdf"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("Error generating brochure:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate brochure" });
  }
};
