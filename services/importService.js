// services/importService.js
"use strict";

const db = require("../config/database");

/* ── coercions ───────────────────────────────────────────────── */
const emptyNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return (s === "" || s.toLowerCase() === "null") ? null : v;
};

const intOrNull = (v) => {
  v = emptyNull(v);
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const decOrZero = (v) => {
  if (!v && v !== 0) return "0.00";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};

const strOrNull = (v) => {
  v = emptyNull(v);
  return v === null ? null : String(v).trim() || null;
};

const emailNorm = (v) => {
  v = emptyNull(v);
  return v ? String(v).toLowerCase().trim() || null : null;
};

const phoneNorm = (v) => {
  if (!v) return null;
  const d = String(v).replace(/\D/g, "");
  return d || null;
};

const safeStr = (v) => {
  if (!v) return "{}";
  if (typeof v === "string") {
    try {
      JSON.parse(v);
      return v;
    } catch {
      return "{}";
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
};

const dateOnly = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

const boolOrZero = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v ? 1 : 0;
  const s = String(v).toLowerCase();
  return (s === "true" || s === "1" || s === "yes") ? 1 : 0;
};

const lowerKeys = (o) => Object.fromEntries(
  Object.entries(o || {}).map(([k, v]) => [String(k).toLowerCase().trim(), v])
);

/* ── parse uploaded file → array of plain objects ────────────── */
const parseFile = async (buffer, mimetype, originalname) => {
  const ext = (originalname || "").split(".").pop().toLowerCase();

  // JSON
  if (ext === "json" || (mimetype || "").includes("json")) {
    const p = JSON.parse(buffer.toString("utf8"));
    if (Array.isArray(p)) return p;
    if (Array.isArray(p.data)) return p.data;
    throw new Error("JSON must be an array or { data: [] }");
  }

  // XLSX / XLS
  if (["xlsx", "xls"].includes(ext) || (mimetype || "").includes("spreadsheet")) {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Excel file has no worksheets");
    const out = [], hdr = [];
    ws.eachRow((row, ri) => {
      if (ri === 1) {
        row.eachCell((c) => hdr.push(String(c.value ?? "").toLowerCase().trim()));
        return;
      }
      const obj = {};
      row.eachCell({ includeEmpty: true }, (c, ci) => {
        const key = hdr[ci - 1];
        if (!key) return;
        let val = c.value;
        if (val && typeof val === "object" && val.richText) {
          val = val.richText.map((r) => r.text).join("");
        }
        obj[key] = val ?? null;
      });
      if (Object.values(obj).some((v) => v !== null && v !== "")) out.push(obj);
    });
    return out;
  }

  // CSV
  const Papa = require("papaparse");
  const { data, errors } = Papa.parse(buffer.toString("utf8"), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim(),
  });
  if (errors.length && !data.length) throw new Error(`CSV parse error: ${errors[0].message}`);
  return data;
};

/* ── normalise row per entity ────────────────────────────────── */
const normalise = (entity, raw) => {
  const r = lowerKeys(raw);
  
  switch (entity) {
    case "leads":
      return {
        salutation:            strOrNull(r.salutation) ?? "Mr.",
        name:                  strOrNull(r.name),
        phone:                 phoneNorm(r.phone),
        whatsapp_number:       phoneNorm(r.whatsapp_number ?? r.whatsapp),
        email:                 emailNorm(r.email),
        lead_type:             strOrNull(r.lead_type ?? r.leadtype),
        lead_source:           strOrNull(r.lead_source ?? r.leadsource),
        stage:                 strOrNull(r.stage) ?? "initial_contact",
        status:                strOrNull(r.status) ?? "active",
        priority:              strOrNull(r.priority) ?? "medium",
        state:                 strOrNull(r.state),
        city:                  strOrNull(r.city),
        location:              strOrNull(r.location),
        assigned_executive:    intOrNull(r.assigned_executive),
        created_by:            intOrNull(r.created_by ?? r.createdby),
        updated_by:            intOrNull(r.updated_by),
        last_contact:          r.last_contact ? new Date(r.last_contact) : null,
        last_contact_by:       intOrNull(r.last_contact_by),
        transferred_to_buyer:  boolOrZero(r.transferred_to_buyer),
        transferred_to_seller: boolOrZero(r.transferred_to_seller),
        is_listed:             boolOrZero(r.is_listed),
      };

    case "buyers":
      return {
        salutation:          strOrNull(r.salutation) ?? "Mr.",
        name:                strOrNull(r.name),
        phone:               phoneNorm(r.phone),
        whatsapp_number:     phoneNorm(r.whatsapp_number ?? r.whatsapp),
        email:               emailNorm(r.email),
        state:               strOrNull(r.state),
        city:                strOrNull(r.city),
        location:            strOrNull(r.location),
        buyer_lead_priority: strOrNull(r.buyer_lead_priority ?? r.priority),
        buyer_lead_source:   strOrNull(r.buyer_lead_source ?? r.source),
        buyer_lead_stage:    strOrNull(r.buyer_lead_stage ?? r.stage),
        buyer_lead_status:   strOrNull(r.buyer_lead_status ?? r.status),
        budget_min:          decOrZero(r.budget_min),
        budget_max:          decOrZero(r.budget_max),
        requirements:        safeStr(r.requirements),
        financials:          safeStr(r.financials),
        assigned_executive:  intOrNull(r.assigned_executive),
        created_by:          intOrNull(r.created_by ?? r.createdby),
        updated_by:          intOrNull(r.updated_by),
        remark:              strOrNull(r.remark),
        dob:                 dateOnly(r.dob),
        nearbylocations:     strOrNull(r.nearbylocations),
        lead_id:             strOrNull(r.lead_id),
        lead_type:           strOrNull(r.lead_type),
        last_contact:        r.last_contact ? new Date(r.last_contact) : null,
        last_contact_by:     intOrNull(r.last_contact_by),
        is_active:           boolOrZero(r.is_active) ?? 1,
      };

    case "sellers":
      return {
        salutation:           strOrNull(r.salutation) ?? "Mr.",
        name:                 strOrNull(r.name),
        phone:                phoneNorm(r.phone),
        whatsapp_number:      phoneNorm(r.whatsapp_number ?? r.whatsapp),
        email:                emailNorm(r.email),
        state:                strOrNull(r.state),
        city:                 strOrNull(r.city),
        location:             strOrNull(r.location),
        seller_lead_priority: strOrNull(r.seller_lead_priority ?? r.priority),
        seller_lead_source:   strOrNull(r.seller_lead_source ?? r.source),
        seller_lead_stage:    strOrNull(r.seller_lead_stage ?? r.stage),
        seller_lead_status:   strOrNull(r.seller_lead_status ?? r.status),
        assigned_executive:   intOrNull(r.assigned_executive),
        created_by:           intOrNull(r.created_by ?? r.createdby),
        updated_by:           intOrNull(r.updated_by),
        remark:               strOrNull(r.remark),
        dob:                  dateOnly(r.dob),
        is_active:            boolOrZero(r.is_active) ?? 1,
      };

    case "properties":
      return {
        propertyId:          strOrNull(r.propertyid ?? r.property_id) || `PROP${Date.now()}`,
        sellerName:          strOrNull(r.sellername ?? r.seller_name) || strOrNull(r.name),
        sellerId:            strOrNull(r.sellerid ?? r.seller_id),
        leadId:              strOrNull(r.leadid ?? r.lead_id),
        assignedTo:          intOrNull(r.assigned_to),
        propertyTypeName:    strOrNull(r.propertytypename ?? r.property_type_name) || "Residential",
        propertySubtypeName: strOrNull(r.propertysubtypename ?? r.property_subtype_name) ?? "Apartment",
        unitType:            strOrNull(r.unittype ?? r.unit_type) ?? strOrNull(r.unit),
        wing:                strOrNull(r.wing) ?? "",
        unitNo:              strOrNull(r.unitno ?? r.unit_no) ?? strOrNull(r.unit),
        furnishing:          strOrNull(r.furnishing) ?? "Un-Furnished",
        balcony:             strOrNull(r.balcony),
        bedrooms:            intOrNull(r.bedrooms),
        bathrooms:           intOrNull(r.bathrooms),
        facing:              strOrNull(r.facing),
        parkingType:         strOrNull(r.parkingtype ?? r.parking_type) ?? "Covered",
        parkingQty:          intOrNull(r.parkingqty ?? r.parking_qty) ?? 1,
        cityName:            strOrNull(r.cityname ?? r.city_name),
        locationName:        strOrNull(r.locationname ?? r.location_name),
        societyName:         strOrNull(r.societyname ?? r.society_name),
        floor:               strOrNull(r.floor),
        totalFloors:         strOrNull(r.totalfloors ?? r.total_floors),
        carpetArea:          decOrZero(r.carpetarea ?? r.carpet_area),
        builtupArea:         decOrZero(r.builtuparea ?? r.builtup_area),
        budget:              r.budget ? BigInt(r.budget) : null,
        priceType:           strOrNull(r.pricetype ?? r.price_type) ?? "Fixed",
        finalPrice:          r.finalprice || r.final_price ? BigInt(r.finalprice || r.final_price) : null,
        address:             strOrNull(r.address),
        status:              strOrNull(r.status) ?? "Available",
        leadSource:          strOrNull(r.leadsource ?? r.lead_source),
        possessionMonth:     intOrNull(r.possessionmonth ?? r.possession_month),
        possessionYear:      intOrNull(r.possessionyear ?? r.possession_year),
        purchaseMonth:       intOrNull(r.purchasemonth ?? r.purchase_month),
        purchaseYear:        intOrNull(r.purchaseyear ?? r.purchase_year),
        sellingRights:       strOrNull(r.sellingrights ?? r.selling_rights) ?? "Standard",
        ownershipDocPath:    strOrNull(r.ownershippath ?? r.ownership_doc_path),
        photos:              safeStr(r.photos),
        amenities:           safeStr(r.amenities),
        furnishingItems:     safeStr(r.furnishingitems ?? r.furnishing_items),
        nearbyPlaces:        safeStr(r.nearbyplaces ?? r.nearby_places),
        description:         safeStr(r.description),
        isPublic:            boolOrZero(r.ispublic ?? r.is_public) ?? 0,
        isPrivate:           boolOrZero(r.isprivate ?? r.is_private) ?? 0,
        isSold:              boolOrZero(r.issold ?? r.is_sold) ?? 0,
        isAvailable:         boolOrZero(r.isavailable ?? r.is_available) ?? 1,
        isNewListing:        boolOrZero(r.isnewlisting ?? r.is_new_listing) ?? 0,
        isPremium:           boolOrZero(r.ispremium ?? r.is_premium) ?? 0,
        isVerified:          boolOrZero(r.isverified ?? r.is_verified) ?? 0,
        isFeatured:          boolOrZero(r.isfeatured ?? r.is_featured) ?? 0,
        publicationDate:     r.publicationdate || r.publication_date ? new Date(r.publicationdate || r.publication_date) : new Date(),
        createdBy:           intOrNull(r.created_by),
        updatedBy:           intOrNull(r.updated_by),
        publicViews:         intOrNull(r.publicviews ?? r.public_views) ?? 0,
        publicInquiries:     intOrNull(r.publicinquiries ?? r.public_inquiries) ?? 0,
        slug:                strOrNull(r.slug),
      };

    case "users":
      return {
        username:           strOrNull(r.username),
        first_name:         strOrNull(r.first_name ?? r.firstname),
        last_name:          strOrNull(r.last_name ?? r.lastname),
        email:              emailNorm(r.email),
        password:           strOrNull(r.password) ?? "Change@123",
        phone:              phoneNorm(r.phone),
        role:               strOrNull(r.role) ?? "executive",
        role_id:            intOrNull(r.role_id),
        is_active:          boolOrZero(r.is_active) ?? 1,
        avatar:             strOrNull(r.avatar),
        designation:        strOrNull(r.designation),
        department:         strOrNull(r.department),
        dob:                dateOnly(r.dob),
        blood_group:        strOrNull(r.blood_group),
        total_leads:        intOrNull(r.total_leads) ?? 0,
        total_properties:   intOrNull(r.total_properties) ?? 0,
        total_revenue:      decOrZero(r.total_revenue),
        module_permissions: safeStr(r.module_permissions),
        salutation:         strOrNull(r.salutation),
        buyer_id:           intOrNull(r.buyer_id),
        seller_id:          intOrNull(r.seller_id),
      };

    default:
      throw new Error(`No normaliser for entity: ${entity}`);
  }
};

/* ── INSERT SQL builders ──────────────────────────────────────── */
const INSERT_DEFS = {
  leads: {
    cols: [
      "salutation", "name", "phone", "whatsapp_number", "email", "lead_type", "lead_source",
      "stage", "status", "priority", "state", "city", "location", "assigned_executive",
      "created_by", "updated_by", "last_contact", "last_contact_by", "transferred_to_buyer",
      "transferred_to_seller", "is_listed"
    ],
    json: [],
  },
  buyers: {
    cols: [
      "salutation", "name", "phone", "whatsapp_number", "email", "state", "city", "location",
      "buyer_lead_priority", "buyer_lead_source", "buyer_lead_stage", "buyer_lead_status",
      "budget_min", "budget_max", "requirements", "financials", "assigned_executive",
      "created_by", "updated_by", "remark", "dob", "nearbylocations", "lead_id", "lead_type",
      "last_contact", "last_contact_by", "is_active"
    ],
    json: ["requirements", "financials"],
  },
  sellers: {
    cols: [
      "salutation", "name", "phone", "whatsapp_number", "email", "state", "city", "location",
      "seller_lead_priority", "seller_lead_source", "seller_lead_stage", "seller_lead_status",
      "assigned_executive", "created_by", "updated_by", "remark", "dob", "is_active"
    ],
    json: [],
  },
  properties: {
    cols: [
      "propertyId", "sellerName", "sellerId", "leadId", "assignedTo", "propertyTypeName",
      "propertySubtypeName", "unitType", "wing", "unitNo", "furnishing", "balcony", "bedrooms",
      "bathrooms", "facing", "parkingType", "parkingQty", "cityName", "locationName", "societyName",
      "floor", "totalFloors", "carpetArea", "builtupArea", "budget", "priceType", "finalPrice",
      "address", "status", "leadSource", "possessionMonth", "possessionYear", "purchaseMonth",
      "purchaseYear", "sellingRights", "ownershipDocPath", "photos", "amenities", "furnishingItems",
      "nearbyPlaces", "description", "isPublic", "isPrivate", "isSold", "isAvailable", "isNewListing",
      "isPremium", "isVerified", "isFeatured", "publicationDate", "createdBy", "updatedBy",
      "publicViews", "publicInquiries", "slug"
    ],
    json: ["photos", "amenities", "furnishingItems", "nearbyPlaces", "description"],
  },
  users: {
    cols: [
      "username", "first_name", "last_name", "email", "password", "phone", "role", "role_id",
      "is_active", "avatar", "designation", "department", "dob", "blood_group", "total_leads",
      "total_properties", "total_revenue", "module_permissions", "salutation", "buyer_id", "seller_id"
    ],
    json: ["module_permissions"],
  },
};

const ENTITY_TABLES = {
  leads: "client_leads",
  buyers: "buyers",
  sellers: "sellers",
  properties: "my_properties",
  users: "users",
};

const REQUIRED = {
  leads: ["name", "phone"],
  buyers: ["name", "phone"],
  sellers: ["name", "phone"],
  properties: ["propertyId"],
  users: ["username", "first_name", "email"],
};

const buildSQL = (entity) => {
  const def = INSERT_DEFS[entity];
  const table = ENTITY_TABLES[entity];
  const vals = def.cols.map((c) => def.json.includes(c) ? "CAST(? AS JSON)" : "?");
  const colsWithTimestamps = [...def.cols, "created_at", "updated_at"];
  const valsWithTimestamps = [...vals, "NOW()", "NOW()"];
  
  return {
    sql: `INSERT INTO \`${table}\` (${colsWithTimestamps.map((c) => `\`${c}\``).join(",")}) VALUES (${valsWithTimestamps.join(",")})`,
    cols: def.cols,
  };
};

/* ── Main import function ────────────────────────────────────── */
const importEntity = async (entity, buffer, mimetype, originalname, { created_by = null } = {}) => {
  const table = ENTITY_TABLES[entity];
  if (!table) throw new Error(`Unknown entity: ${entity}`);

  const rawRows = await parseFile(buffer, mimetype, originalname);
  if (!rawRows.length) {
    return { inserted: 0, skipped: 0, total: 0, skippedRows: [], insertedRows: [] };
  }

  // Preload existing emails + phones for dedup (skip for properties)
  const existingEmails = new Set();
  const existingPhones = new Set();
  if (entity !== "properties") {
    try {
      const [ex] = await db.query(`SELECT email, phone FROM \`${table}\` WHERE email IS NOT NULL OR phone IS NOT NULL`);
      ex.forEach((r) => {
        if (r.email) existingEmails.add(String(r.email).toLowerCase().trim());
        if (r.phone) existingPhones.add(String(r.phone).replace(/\D/g, ""));
      });
    } catch (_) {
      // Table may not have both columns
    }
  }

  const { sql, cols } = buildSQL(entity);
  const required = REQUIRED[entity] || [];
  const skippedRows = [];
  const insertedRows = [];
  let inserted = 0;

  for (const [i, raw] of rawRows.entries()) {
    const rowNum = i + 2;
    let norm;
    try {
      norm = normalise(entity, raw);
    } catch (e) {
      skippedRows.push({ row: rowNum, reason: e.message, data: raw });
      continue;
    }

    // Fallback created_by
    if ((norm.created_by === null || norm.created_by === undefined) && created_by) {
      norm.created_by = intOrNull(created_by);
    }

    // Required check
    const missing = required.filter((f) => !norm[f]);
    if (missing.length) {
      skippedRows.push({ row: rowNum, reason: `Missing: ${missing.join(", ")}`, data: raw });
      continue;
    }

    // Dedup (skip for properties)
    if (entity !== "properties") {
      if (norm.email && existingEmails.has(norm.email)) {
        skippedRows.push({ row: rowNum, reason: `Email already exists (${norm.email})`, data: raw });
        continue;
      }
      if (norm.phone && existingPhones.has(norm.phone)) {
        skippedRows.push({ row: rowNum, reason: `Phone already exists (${norm.phone})`, data: raw });
        continue;
      }
    }

    try {
      const values = cols.map((c) => norm[c] ?? null);
      const [res] = await db.execute(sql, values);
      inserted++;
      insertedRows.push({
        id: res.insertId,
        name: norm.name ?? norm.title ?? norm.propertyId ?? norm.first_name ?? norm.username ?? "—",
      });
      if (norm.email && entity !== "properties") existingEmails.add(norm.email);
      if (norm.phone && entity !== "properties") existingPhones.add(norm.phone);
    } catch (err) {
      const reason =
        err.code === "ER_DUP_ENTRY" ? "Duplicate (email/phone/username already exists)" :
        err.code === "3140" ? "Invalid JSON data" :
        `DB error: ${err.message}`;
      skippedRows.push({ row: rowNum, reason, data: raw, dbError: err.message });
    }
  }

  return {
    inserted,
    skipped: skippedRows.length,
    total: rawRows.length,
    skippedRows,
    insertedRows,
  };
};

module.exports = { importEntity };