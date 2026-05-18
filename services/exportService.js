// services/exportService.js
"use strict";

const db = require("../config/database");

/* ================================================================
   Each entity config: which table + columns to export
   Based on YOUR ACTUAL database schema
================================================================ */
const ENTITY_CONFIG = {
  leads: {
    table: "client_leads",
    columns: [
      "id", "salutation", "name", "phone", "whatsapp_number", "email", "lead_type", "lead_source",
      "stage", "status", "priority", "state", "city", "location", "assigned_executive",
      "created_by", "updated_by", "last_contact", "last_contact_by", "created_at", "updated_at",
      "transferred_to_buyer", "transferred_to_seller", "is_listed"
    ],
    headers: [
      "ID", "Salutation", "Name", "Phone", "WhatsApp", "Email", "Lead Type", "Lead Source",
      "Stage", "Status", "Priority", "State", "City", "Location", "Assigned Executive",
      "Created By", "Updated By", "Last Contact", "Last Contact By", "Created At", "Updated At",
      "Transferred To Buyer", "Transferred To Seller", "Is Listed"
    ],
    jsonFields: [],
    templateCols: [
      "salutation", "name", "phone", "whatsapp_number", "email", "lead_type", "lead_source",
      "stage", "status", "priority", "state", "city", "location"
    ],
  },
  buyers: {
    table: "buyers",
    columns: [
      "id", "salutation", "name", "phone", "whatsapp_number", "email", "state", "city", "location",
      "buyer_lead_priority", "buyer_lead_source", "buyer_lead_stage", "buyer_lead_status",
      "budget_min", "budget_max", "requirements", "financials", "assigned_executive",
      "created_by", "updated_by", "remark", "dob", "nearbylocations", "lead_id", "lead_type",
      "last_contact", "last_contact_by", "is_active", "created_at", "updated_at"
    ],
    headers: [
      "ID", "Salutation", "Name", "Phone", "WhatsApp", "Email", "State", "City", "Location",
      "Priority", "Source", "Stage", "Status", "Budget Min", "Budget Max",
      "Requirements", "Financials", "Assigned Executive", "Created By", "Updated By",
      "Remark", "DOB", "Nearby Locations", "Lead ID", "Lead Type", "Last Contact",
      "Last Contact By", "Is Active", "Created At", "Updated At"
    ],
    jsonFields: ["requirements", "financials"],
    templateCols: [
      "salutation", "name", "phone", "whatsapp_number", "email", "state", "city", "location",
      "buyer_lead_priority", "buyer_lead_source", "buyer_lead_stage", "buyer_lead_status",
      "budget_min", "budget_max", "remark", "dob", "nearbylocations"
    ],
  },
  sellers: {
    table: "sellers",
    columns: [
      "id", "salutation", "name", "phone", "whatsapp_number", "email", "state", "city", "location",
      "seller_lead_priority", "seller_lead_source", "seller_lead_stage", "seller_lead_status",
      "assigned_executive", "created_by", "updated_by", "remark", "dob", "is_active", "created_at", "updated_at"
    ],
    headers: [
      "ID", "Salutation", "Name", "Phone", "WhatsApp", "Email", "State", "City", "Location",
      "Priority", "Source", "Stage", "Status", "Assigned Executive", "Created By", "Updated By",
      "Remark", "DOB", "Is Active", "Created At", "Updated At"
    ],
    jsonFields: [],
    templateCols: [
      "salutation", "name", "phone", "whatsapp_number", "email", "state", "city", "location",
      "seller_lead_priority", "seller_lead_source", "seller_lead_stage", "seller_lead_status",
      "remark", "dob"
    ],
  },
  properties: {
    table: "my_properties",
    columns: [
      "id", "propertyId", "sellerName", "sellerId", "leadId", "assignedTo", "propertyTypeName",
      "propertySubtypeName", "unitType", "wing", "unitNo", "furnishing", "balcony", "bedrooms",
      "bathrooms", "facing", "parkingType", "parkingQty", "cityName", "locationName", "societyName",
      "floor", "totalFloors", "carpetArea", "builtupArea", "budget", "priceType", "finalPrice",
      "address", "status", "leadSource", "possessionMonth", "possessionYear", "purchaseMonth",
      "purchaseYear", "sellingRights", "ownershipDocPath", "photos", "amenities", "furnishingItems",
      "nearbyPlaces", "description", "isPublic", "isPrivate", "isSold", "isAvailable", "isNewListing",
      "isPremium", "isVerified", "isFeatured", "publicationDate", "createdBy", "updatedBy",
      "publicViews", "publicInquiries", "slug", "created_at", "updated_at"
    ],
    headers: [
      "ID", "Property ID", "Seller Name", "Seller ID", "Lead ID", "Assigned To", "Property Type",
      "Property Subtype", "Unit Type", "Wing", "Unit No", "Furnishing", "Balcony", "Bedrooms",
      "Bathrooms", "Facing", "Parking Type", "Parking Qty", "City", "Location", "Society",
      "Floor", "Total Floors", "Carpet Area", "Built-up Area", "Budget", "Price Type", "Final Price",
      "Address", "Status", "Lead Source", "Possession Month", "Possession Year", "Purchase Month",
      "Purchase Year", "Selling Rights", "Ownership Doc Path", "Photos", "Amenities", "Furnishing Items",
      "Nearby Places", "Description", "Is Public", "Is Private", "Is Sold", "Is Available",
      "Is New Listing", "Is Premium", "Is Verified", "Is Featured", "Publication Date",
      "Created By", "Updated By", "Public Views", "Public Inquiries", "Slug", "Created At", "Updated At"
    ],
    jsonFields: ["photos", "amenities", "furnishingItems", "nearbyPlaces", "description"],
    templateCols: [
      "propertyId", "sellerName", "propertyTypeName", "propertySubtypeName", "unitType",
      "cityName", "locationName", "budget", "carpetArea", "status", "bedrooms", "bathrooms", "furnishing"
    ],
  },
  users: {
    table: "users",
    columns: [
      "id", "username", "first_name", "last_name", "email", "phone", "role", "role_id", "is_active",
      "avatar", "designation", "department", "dob", "blood_group", "last_login", "created_at", "updated_at",
      "total_leads", "total_properties", "total_revenue", "module_permissions", "salutation",
      "buyer_id", "seller_id"
    ],
    headers: [
      "ID", "Username", "First Name", "Last Name", "Email", "Phone", "Role", "Role ID", "Is Active",
      "Avatar", "Designation", "Department", "DOB", "Blood Group", "Last Login", "Created At", "Updated At",
      "Total Leads", "Total Properties", "Total Revenue", "Module Permissions", "Salutation",
      "Buyer ID", "Seller ID"
    ],
    jsonFields: ["module_permissions"],
    templateCols: [
      "username", "first_name", "last_name", "email", "phone", "role", "salutation"
    ],
  },
};

/* ── helpers ─────────────────────────────────────────────────── */
const safeVal = (v, col, cfg) => {
  if (cfg.jsonFields && cfg.jsonFields.includes(col)) {
    if (!v) return "";
    if (typeof v === "object") return JSON.stringify(v);
    try {
      const parsed = JSON.parse(v);
      return JSON.stringify(parsed);
    } catch {
      return String(v);
    }
  }
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return v.toString();
  return v;
};

/* ── fetch from DB ───────────────────────────────────────────── */
const fetchRows = async (entity) => {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity: ${entity}`);

  const cols = cfg.columns.map((c) => `\`${c}\``).join(", ");
  const [rows] = await db.execute(`SELECT ${cols} FROM \`${cfg.table}\` ORDER BY id DESC`);
  return { rows, cfg };
};

/* ── CSV ─────────────────────────────────────────────────────── */
const toCSV = (rows, cfg) => {
  const esc = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const head = cfg.headers.join(",");
  const body = rows.map((r) => cfg.columns.map((c) => esc(safeVal(r[c], c, cfg))).join(","));
  return Buffer.from([head, ...body].join("\r\n"), "utf8");
};

/* ── XLSX ────────────────────────────────────────────────────── */
const toXLSX = async (rows, cfg) => {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");

  ws.columns = cfg.headers.map((h) => ({
    header: h,
    key: h,
    width: Math.min(Math.max(h.length + 4, 16), 35)
  }));

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C3854" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(1).height = 22;

  rows.forEach((r, ri) => {
    const row = ws.addRow(cfg.columns.map((c) => safeVal(r[c], c, cfg)));
    if (ri % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
      });
    }
  });

  return ws.workbook.xlsx.writeBuffer();
};

/* ── JSON ────────────────────────────────────────────────────── */
const toJSON = (rows, cfg, entity) => {
  const data = rows.map((r) => {
    const out = {};
    cfg.columns.forEach((col) => {
      const v = r[col];
      if (cfg.jsonFields && cfg.jsonFields.includes(col)) {
        try {
          out[col] = typeof v === "string" ? JSON.parse(v) : (v ?? {});
        } catch {
          out[col] = {};
        }
      } else {
        out[col] = v ?? null;
      }
    });
    return out;
  });
  return Buffer.from(JSON.stringify({
    entity,
    total: data.length,
    exported_at: new Date().toISOString(),
    data
  }, null, 2), "utf8");
};

/* ── PDF ─────────────────────────────────────────────────────── */
const toPDF = (rows, cfg, entity) =>
  new Promise((resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");
      const chunks = [];
      const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width, H = doc.page.height;

      doc.rect(0, 0, W, 50).fill("#0c3854");
      doc.fillColor("white").fontSize(15).font("Helvetica-Bold")
        .text(`${entity.toUpperCase()} — DATA EXPORT`, 30, 13);
      doc.fillColor("#e87722").fontSize(9).font("Helvetica")
        .text(`Exported: ${new Date().toLocaleString()}  |  Total records: ${rows.length}`, 30, 33);

      const pdfCols = cfg.columns.slice(0, 6);
      const pdfHeaders = cfg.headers.slice(0, 6);
      const colW = (W - 60) / pdfCols.length;
      let y = 65;

      doc.rect(30, y, W - 60, 18).fill("#0c3854");
      doc.fillColor("white").fontSize(7).font("Helvetica-Bold");
      pdfHeaders.forEach((h, i) => doc.text(h, 33 + i * colW, y + 5, { width: colW - 4, ellipsis: true }));
      y += 18;

      doc.font("Helvetica").fontSize(6.5);
      const displayRows = rows.slice(0, 50);
      displayRows.forEach((r, ri) => {
        if (y > H - 50) {
          doc.addPage({ margin: 30, layout: "landscape" });
          y = 30;
        }
        doc.rect(30, y, W - 60, 13).fill(ri % 2 === 0 ? "#f0f4f8" : "white");
        doc.fillColor("#0c3854");
        pdfCols.forEach((col, i) => {
          let v = safeVal(r[col], col, cfg);
          if (cfg.jsonFields && cfg.jsonFields.includes(col)) v = "[data]";
          doc.text(String(v).slice(0, 25), 33 + i * colW, y + 3, { width: colW - 4, ellipsis: true });
        });
        y += 13;
      });

      if (rows.length > 50) {
        doc.fontSize(8).text(`... and ${rows.length - 50} more records`, 30, y + 5);
      }

      doc.rect(0, H - 22, W, 22).fill("#0c3854");
      doc.fillColor("#e87722").fontSize(7).text("Backup System", 30, H - 13);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });

/* ── Main export function ────────────────────────────────────── */
const exportEntity = async (entity, format) => {
  const { rows, cfg } = await fetchRows(entity);

  switch ((format || "csv").toLowerCase()) {
    case "csv":
      return {
        buffer: toCSV(rows, cfg),
        mime: "text/csv",
        ext: "csv",
        count: rows.length
      };
    case "xlsx":
      return {
        buffer: await toXLSX(rows, cfg),
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ext: "xlsx",
        count: rows.length
      };
    case "json":
      return {
        buffer: toJSON(rows, cfg, entity),
        mime: "application/json",
        ext: "json",
        count: rows.length
      };
    case "pdf":
      return {
        buffer: await toPDF(rows, cfg, entity),
        mime: "application/pdf",
        ext: "pdf",
        count: rows.length
      };
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
};

/* ── Template (blank file with headers) ─────────────────────── */
const generateTemplate = async (entity, format = "csv") => {
  const cfg = ENTITY_CONFIG[entity];
  if (!cfg) throw new Error(`Unknown entity: ${entity}`);

  const tCols = cfg.templateCols;
  const tHeaders = tCols.map((c) => {
    const idx = cfg.columns.indexOf(c);
    return idx >= 0 ? cfg.headers[idx] : c;
  });

  if (format === "xlsx") {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Template");
    ws.columns = tHeaders.map((h) => ({
      header: h,
      key: h,
      width: Math.min(Math.max(h.length + 6, 18), 30)
    }));
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE87722" } };
      cell.alignment = { horizontal: "center" };
    });
    ws.getRow(1).height = 20;
    ws.addRow(tHeaders.map((h) => `<${h}>`));
    return {
      buffer: await ws.workbook.xlsx.writeBuffer(),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: "xlsx"
    };
  }

  const csv = [
    tHeaders.join(","),
    tHeaders.map((h) => `<${h}>`).join(",")
  ].join("\r\n");
  return {
    buffer: Buffer.from(csv, "utf8"),
    mime: "text/csv",
    ext: "csv"
  };
};

module.exports = { exportEntity, generateTemplate, ENTITY_CONFIG };