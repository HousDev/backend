// config/entitySchemas.js
"use strict";

/* ================================================================
   Central schema registry for every exportable / importable entity.

   Each entry defines:
     table      – MySQL table name
     columns    – ordered list of DB column names to SELECT / INSERT
     headers    – matching human-readable CSV / Excel header labels
     jsonFields – columns that hold JSON strings (parsed on export)
     required   – columns that MUST have a non-empty value on import
     uniqueKeys – columns used for duplicate detection on import
================================================================ */

const SCHEMAS = {
  /* ── Leads ─────────────────────────────────────────────────── */
  leads: {
    table: "leads",
    columns: [
      "id","salutation","name","phone","whatsapp_number","email",
      "state","city","location","lead_priority","lead_source",
      "lead_stage","lead_status","budget_min","budget_max",
      "requirements","financials","assigned_executive","created_by",
      "remark","dob","created_at","updated_at",
    ],
    headers: [
      "ID","Salutation","Name","Phone","WhatsApp","Email",
      "State","City","Location","Priority","Source",
      "Stage","Status","Budget Min","Budget Max",
      "Requirements","Financials","Assigned Executive","Created By",
      "Remark","DOB","Created At","Updated At",
    ],
    jsonFields:  ["requirements","financials"],
    required:    ["name","phone"],
    uniqueKeys:  ["email","phone"],
    templateCols: [
      "salutation","name","phone","whatsapp_number","email",
      "state","city","location","lead_priority","lead_source",
      "lead_stage","lead_status","budget_min","budget_max","remark","dob",
    ],
  },

  /* ── Users ──────────────────────────────────────────────────── */
  users: {
    table: "users",
    columns: [
      "id","salutation","first_name","last_name","email","phone",
      "role","status","created_at","updated_at",
    ],
    headers: [
      "ID","Salutation","First Name","Last Name","Email","Phone",
      "Role","Status","Created At","Updated At",
    ],
    jsonFields:  [],
    required:    ["first_name","email"],
    uniqueKeys:  ["email","phone"],
    templateCols: [
      "salutation","first_name","last_name","email","phone","role","status",
    ],
  },

  /* ── Properties ─────────────────────────────────────────────── */
  properties: {
    table: "properties",
    columns: [
      "id","title","property_type","property_subtype","unit_type",
      "city","location","state","price","budget_min","budget_max",
      "carpet_area","floor","furnishing","parking","bedrooms","bathrooms",
      "possession","status","is_public","assigned_to","created_by",
      "created_at","updated_at",
    ],
    headers: [
      "ID","Title","Property Type","Subtype","Unit Type",
      "City","Location","State","Price","Budget Min","Budget Max",
      "Carpet Area","Floor","Furnishing","Parking","Bedrooms","Bathrooms",
      "Possession","Status","Is Public","Assigned To","Created By",
      "Created At","Updated At",
    ],
    jsonFields:  [],
    required:    ["title","city"],
    uniqueKeys:  [],
    templateCols: [
      "title","property_type","property_subtype","unit_type","city","location",
      "state","price","carpet_area","floor","furnishing","parking",
      "bedrooms","bathrooms","possession","status",
    ],
  },

  /* ── Buyers ─────────────────────────────────────────────────── */
  buyers: {
    table: "buyers",
    columns: [
      "id","salutation","name","phone","whatsapp_number","email",
      "state","city","location","buyer_lead_priority","buyer_lead_source",
      "buyer_lead_stage","buyer_lead_status","budget_min","budget_max",
      "requirements","financials","assigned_executive","created_by",
      "remark","dob","nearbylocations","created_at","updated_at",
    ],
    headers: [
      "ID","Salutation","Name","Phone","WhatsApp","Email",
      "State","City","Location","Priority","Source",
      "Stage","Status","Budget Min","Budget Max",
      "Requirements","Financials","Assigned Executive","Created By",
      "Remark","DOB","Nearby Locations","Created At","Updated At",
    ],
    jsonFields:  ["requirements","financials"],
    required:    ["name","phone"],
    uniqueKeys:  ["email","phone"],
    templateCols: [
      "salutation","name","phone","whatsapp_number","email",
      "state","city","location","buyer_lead_priority","buyer_lead_source",
      "buyer_lead_stage","buyer_lead_status","budget_min","budget_max",
      "remark","dob","nearbylocations",
    ],
  },

  /* ── Sellers ─────────────────────────────────────────────────── */
  sellers: {
    table: "sellers",
    columns: [
      "id","salutation","name","phone","whatsapp_number","email",
      "state","city","location","seller_lead_priority","seller_lead_source",
      "seller_lead_stage","seller_lead_status","assigned_executive","created_by",
      "remark","dob","created_at","updated_at",
    ],
    headers: [
      "ID","Salutation","Name","Phone","WhatsApp","Email",
      "State","City","Location","Priority","Source",
      "Stage","Status","Assigned Executive","Created By",
      "Remark","DOB","Created At","Updated At",
    ],
    jsonFields:  [],
    required:    ["name","phone"],
    uniqueKeys:  ["email","phone"],
    templateCols: [
      "salutation","name","phone","whatsapp_number","email",
      "state","city","location","seller_lead_priority","seller_lead_source",
      "seller_lead_stage","seller_lead_status","remark","dob",
    ],
  },
};

module.exports = SCHEMAS;