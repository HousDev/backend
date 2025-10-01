// models/Property.js
const db = require("../config/database");
const { v4: uuidv4 } = require('uuid'); // npm i uuid
// -------- helper: safe JSON ----------
function safeJsonParse(str, defaultValue = []) {
  if (!str) return defaultValue;
  if (typeof str !== "string") return Array.isArray(str) ? str : defaultValue;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : defaultValue;
  } catch {
    if (str.includes(",")) {
      return str
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [str];
  }
}

class Property {
  /* =========================
     CREATE
     ========================= */
  static async create(data) {
    const [result] = await db.execute(
      `INSERT INTO my_properties
       (seller_name, seller_id, assigned_to, property_type_name, property_subtype_name,
        unit_type, wing, unit_no, furnishing, bedrooms, bathrooms, facing ,
        parking_type, parking_qty, city_name, location_name, society_name,
        floor, total_floors, carpet_area, builtup_area, budget, price_type, final_price,
        address, status, lead_source,
        possession_month, possession_year,
        purchase_month, purchase_year,
        selling_rights, ownership_doc_path,
        photos, amenities, furnishing_items, nearby_places,
        description, is_public, publication_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?, ?, ?,?,?,?,?,?)`,
      [
        data.seller_name || null,
        data.seller_id || null,
        data.assigned_to || null,
        data.property_type_name || null,
        data.property_subtype_name || null,
        data.unit_type || null,
        data.wing || null,
        data.unit_no || null,
        data.furnishing || null,

        // NEW
        data.bedrooms || null,
        data.bathrooms || null,
        data.facing || null,

        data.parking_type || null,
        data.parking_qty || null,
        data.city_name || null,
        data.location_name || null,
        data.society_name || null,
        data.floor || null,
        data.total_floors || null,
        data.carpet_area || null,
        data.builtup_area || null,
        data.budget || null,

        // NEW
        data.price_type || "Fixed",
        data.final_price || null,

        data.address || null,
        data.status || null,
        data.lead_source || null,
        data.possession_month || null,
        data.possession_year || null,
        data.purchase_month || null,
        data.purchase_year || null,
        data.selling_rights || null,
        data.ownership_doc_path || null,
        data.photos ? JSON.stringify(data.photos) : null,
        data.amenities ? JSON.stringify(data.amenities) : null,
        data.furnishing_items ? JSON.stringify(data.furnishing_items) : null,
        data.nearby_places ? JSON.stringify(data.nearby_places) : null,
        data.description || null,
        typeof data.is_public === "boolean" ? (data.is_public ? 1 : 0) : 0,
        data.publication_date || null,
      ]
    );
    return result.insertId;
  }

  static async updateSlug(id, slug) {
    const [r] = await db.execute(
      "UPDATE my_properties SET slug = ? WHERE id = ?",
      [slug, id]
    );
    return r.affectedRows;
  }

  /* =========================
     READ
     ========================= */
  static async getAll() {
    const [rows] = await db.execute(
      "SELECT * FROM my_properties ORDER BY created_at DESC"
    );
    return rows.map((row) => {
      row.photos = safeJsonParse(row.photos, []);
      row.amenities = safeJsonParse(row.amenities, []);
      row.furnishing_items = safeJsonParse(row.furnishing_items, []);
      row.nearby_places = safeJsonParse(row.nearby_places, []);
      return row;
    });
  }

  static async getById(id) {
    const [rows] = await db.execute(
      "SELECT * FROM my_properties WHERE id = ?",
      [id]
    );
    const property = rows[0];
    if (!property) return null;
    property.photos = safeJsonParse(property.photos, []);
    property.amenities = safeJsonParse(property.amenities, []);
    property.furnishing_items = safeJsonParse(property.furnishing_items, []);
    property.nearby_places = safeJsonParse(property.nearby_places, []);
    return property;
  }

  /* =========================
     UPDATE (full-row)
     ========================= */
  static async update(id, data) {
    const existing = await this.getById(id);
    let updatedPhotos = data.photos || [];
    if (data.appendPhotos && existing?.photos) {
      updatedPhotos = [...existing.photos, ...updatedPhotos];
    }

    const [result] = await db.execute(
      `UPDATE my_properties SET
        seller_name = ?, seller_id = ?, assigned_to = ?, property_type_name = ?, property_subtype_name = ?,
        unit_type = ?, wing = ?, unit_no = ?, furnishing = ?, bedrooms = ?, bathrooms = ?, facing = ?,
        parking_type = ?, parking_qty = ?, city_name = ?, location_name = ?, society_name = ?,
        floor = ?, total_floors = ?, carpet_area = ?, builtup_area = ?, budget = ?, bedrooms = ?, bathrooms = ?, facing = ?,
        address = ?, status = ?, lead_source = ?,
        possession_month = ?, possession_year = ?,
        purchase_month = ?, purchase_year = ?,
        selling_rights = ?, ownership_doc_path = ?,
        photos = ?, amenities = ?, furnishing_items = ?, nearby_places = ?,
        description = ?, is_public = COALESCE(?, is_public),
        publication_date = COALESCE(?, publication_date),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.seller_name || null,
        data.seller_id || null,
        data.assigned_to || null,
        data.property_type_name || null,
        data.property_subtype_name || null,
        data.unit_type || null,
        data.wing || null,
        data.unit_no || null,
        data.furnishing || null,

        // NEW
        data.bedrooms ?? null,
        data.bathrooms ?? null,
        data.facing || null,

        data.parking_type || null,
        data.parking_qty || null,
        data.city_name || null,
        data.location_name || null,
        data.society_name || null,
        data.floor || null,
        data.total_floors || null,
        data.carpet_area || null,
        data.builtup_area || null,
        data.budget || null,

        // NEW
        data.price_type || "Fixed",
        data.final_price ?? null,

        data.address || null,
        data.status || null,
        data.lead_source || null,
        data.possession_month || null,
        data.possession_year || null,
        data.purchase_month || null,
        data.purchase_year || null,
        data.selling_rights || null,
        data.ownership_doc_path || null,
        updatedPhotos.length ? JSON.stringify(updatedPhotos) : null,
        data.amenities ? JSON.stringify(data.amenities) : null,
        data.furnishing_items ? JSON.stringify(data.furnishing_items) : null,
        data.nearby_places ? JSON.stringify(data.nearby_places) : null,
        data.description || null,
        typeof data.is_public === "boolean" ? (data.is_public ? 1 : 0) : null,
        data.publication_date || null,
        id,
      ]
    );
    return result.affectedRows;
  }

  /* =========================
     DELETE
     ========================= */
  static async delete(id) {
    const [result] = await db.execute(
      "DELETE FROM my_properties WHERE id = ?",
      [id]
    );
    return result.affectedRows;
  }

  /* =========================
     PHOTOS utils
     ========================= */
  static async addPhotos(propertyId, photoPaths) {
    const existing = await this.getById(propertyId);
    const current = existing ? existing.photos : [];
    const merged = [...current, ...photoPaths];
    const [res] = await db.execute(
      "UPDATE my_properties SET photos = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify(merged), propertyId]
    );
    return res.affectedRows;
  }

  static async getPhotos(propertyId) {
    const p = await this.getById(propertyId);
    return p ? p.photos : [];
  }

  static async deletePhotos(propertyId) {
    const [res] = await db.execute(
      "UPDATE my_properties SET photos = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [propertyId]
    );
    return res.affectedRows;
  }

  static async deleteSpecificPhotos(propertyId, photosToDelete) {
    const p = await this.getById(propertyId);
    if (!p || !p.photos) return 0;
    const remaining = p.photos.filter((ph) => !photosToDelete.includes(ph));
    const [res] = await db.execute(
      "UPDATE my_properties SET photos = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [remaining.length ? JSON.stringify(remaining) : null, propertyId]
    );
    return res.affectedRows;
  }

  /* =========================
     MIGRATION helper
     ========================= */
  static async migrateData() {
    const [rows] = await db.execute(
      "SELECT id, amenities, furnishing_items, nearby_places, photos FROM my_properties"
    );
    for (const row of rows) {
      const updates = {};
      const fix = (v, wrap) => {
        try {
          JSON.parse(v);
          return null;
        } catch {
          return wrap;
        }
      };
      if (row.amenities && fix(row.amenities, JSON.stringify([row.amenities])))
        updates.amenities = JSON.stringify([row.amenities]);
      if (
        row.furnishing_items &&
        fix(row.furnishing_items, JSON.stringify([row.furnishing_items]))
      )
        updates.furnishing_items = JSON.stringify([row.furnishing_items]);
      if (
        row.nearby_places &&
        fix(row.nearby_places, JSON.stringify([{ name: row.nearby_places }]))
      )
        updates.nearby_places = JSON.stringify([{ name: row.nearby_places }]);
      if (row.photos && fix(row.photos, JSON.stringify([row.photos])))
        updates.photos = JSON.stringify([row.photos]);

      if (Object.keys(updates).length) {
        const setClause = Object.keys(updates)
          .map((k) => `${k} = ?`)
          .join(", ");
        const values = [...Object.values(updates), row.id];
        await db.execute(
          `UPDATE my_properties SET ${setClause} WHERE id = ?`,
          values
        );
      }
    }
  }

  /* =========================
     BULK operations (fast)
     ========================= */

  static async bulkUpdateStatus(propertyIds = [], status) {
    if (!propertyIds.length) return { affected: 0 };
    const placeholders = propertyIds.map(() => "?").join(",");
    const [res] = await db.execute(
      `UPDATE my_properties
         SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      [status, ...propertyIds]
    );
    return { affected: res.affectedRows };
  }

  static async bulkMarkPublic(propertyIds = [], isPublic) {
    if (!propertyIds.length) return { affected: 0 };
    const placeholders = propertyIds.map(() => "?").join(",");
    const [res] = await db.execute(
      `UPDATE my_properties
         SET is_public = ?,
             publication_date = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      [isPublic ? 1 : 0, isPublic ? 1 : 0, ...propertyIds]
    );
    return { affected: res.affectedRows };
  }

  static async bulkDelete(propertyIds = []) {
    if (!propertyIds.length) return { affected: 0 };
    const placeholders = propertyIds.map(() => "?").join(",");
    const [res] = await db.execute(
      `DELETE FROM my_properties WHERE id IN (${placeholders})`,
      propertyIds
    );
    return { affected: res.affectedRows };
  }

  static async togglePublic(id, isPublic) {
    const [res] = await db.execute(
      `UPDATE my_properties
         SET is_public = ?,
             publication_date = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [isPublic ? 1 : 0, isPublic ? 1 : 0, id]
    );
    return res.affectedRows;
  }

  static async getMany(ids = []) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT * FROM my_properties WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  }

  static isValidJson(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
  /* =========================
     EVENTS / ANALYTICS
     ========================= */

  /**
   * Record an analytics event for a property.
   * This is a best-effort helper: it returns { success, affectedRows?, error? }.
   *
   * @param {object} opts
   * @param {number|string} opts.property_id
   * @param {string|null} opts.slug
   * @param {string} [opts.event_type='view']
   * @param {string} [opts.event_name='page_view']
   * @param {object} [opts.payload={}]
   * @param {string|null} [opts.ip=null]
   * @param {string|null} [opts.user_agent=null]
   * @param {string|null} [opts.referrer=null]
   * @param {string|null} [opts.session_id=null]
   */
  static async recordEvent({
    property_id,
    slug = null,
    event_type = "view",
    event_name = "page_view",
    payload = {},
    ip = null,
    user_agent = null,
    referrer = null,
    session_id = null,
  }) {
    try {
      const sql = `INSERT INTO property_events (property_id, slug, event_type, event_name, payload, ip, user_agent, referrer, session_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`;
      const vals = [
        property_id,
        slug,
        event_type,
        event_name,
        JSON.stringify(payload || {}),
        ip,
        user_agent,
        referrer,
        session_id,
      ];
      const [result] = await db.execute(sql, vals);
      return { success: true, affectedRows: result.affectedRows, insertId: result.insertId };
    } catch (err) {
      return { success: false, error: err && err.message };
    }
  
}
 /* =========================
     FILTER CONTEXT helpers
     ========================= */

  /**
   * Save a filter context and return its UUID (id).
   * filters: object or JSON-string
   * user_id: optional
   */
  static async saveFilterContext(filters, user_id = null) {
    try {
      const id = uuidv4();
      const jsonFilters = typeof filters === "string" ? filters : JSON.stringify(filters || {});
      await db.execute(
        `INSERT INTO filter_contexts (id, filters, user_id, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, jsonFilters, user_id]
      );
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err && err.message };
    }
  }

  /**
   * Get a filter_context row by id (token)
   */
  static async getFilterContextById(id) {
    try {
      const [rows] = await db.execute(`SELECT * FROM filter_contexts WHERE id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Utility: ensureFilterToken
   * - If tokenOrFilters is an object => create a new filter_context and return its id
   * - If tokenOrFilters is a string => validate existence in filter_contexts and return id or null
   */
  static async ensureFilterToken(tokenOrFilters, user_id = null) {
    // if nothing provided
    if (tokenOrFilters == null) return null;

    // If it's an object (filters) -> save and return id
    if (typeof tokenOrFilters === "object") {
      const saved = await this.saveFilterContext(tokenOrFilters, user_id);
      return saved.success ? saved.id : null;
    }

    // if it's a string -> assume it's a token id; validate existence
    if (typeof tokenOrFilters === "string") {
      // small sanity check: basic uuid-ish length (36) or allow shorter ids if you use numeric tokens
      try {
        const ctx = await this.getFilterContextById(tokenOrFilters);
        return ctx ? tokenOrFilters : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  /* =========================
     EVENTS / ANALYTICS (updated)
     ========================= */
  /**
   * Record an analytics event for a property.
   * Accepts filterToken which can be:
   *  - null
   *  - a filter-token string (existing id)
   *  - an object of filters (will be saved into filter_contexts and id returned)
   *
   * Returns { success, affectedRows?, insertId?, error? }
   */

// models/property.model.js - UPDATED recordEvent method
static async recordEvent({
  property_id,
  slug = null,
  event_type = "view",
  event_name = "page_view",
  payload = {},
  ip = null,
  user_agent = null,
  referrer = null,
  session_id = null,
  filterToken = null,
  dedupe_key = null,
  user_id = null,
  minutes_window = 1, // Default 1 minute for views, can be longer for sessions
}) {
  try {
    // ensure payload is object
    payload = payload || {};
    
    // Normalize/ensure filterToken: if object => create filter_context and get id
    const finalFilterToken = await this.ensureFilterToken(filterToken, user_id);
    
    // For views, prioritize session_id as dedupe_key if available
    // This ensures same session doesn't record multiple views
    const finalDedupeKey = dedupe_key || session_id || finalFilterToken || payload.dedupe_key || null;
    
    // attach finalFilterToken to payload for completeness
    payload.filterToken = finalFilterToken;
    if (finalDedupeKey) payload.dedupe_key = finalDedupeKey;

    // *** CHECK FOR RECENT VIEW BEFORE INSERTING ***
    if (event_type === 'view' && property_id) {
      const Views = require('./views.model');
      const hasRecent = await Views.hasRecentView(
        property_id,
        session_id,
        finalDedupeKey,
        minutes_window,
        ip,
        user_agent
      );
      
      if (hasRecent) {
        return { success: true, affectedRows: 0, insertId: null, duplicate: true };
      }
    }
    
    // Insert into property_events with dedicated dedupe_key column
    const sql = `INSERT INTO property_events
      (property_id, slug, event_type, event_name, payload, ip, user_agent, referrer, session_id, dedupe_key, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`;

    const vals = [
      property_id,
      slug,
      event_type,
      event_name,
      JSON.stringify(payload || {}),
      ip,
      user_agent,
      referrer,
      session_id,
      finalDedupeKey,
    ];

    const [result] = await db.execute(sql, vals);
    
    return {
      success: true,
      affectedRows: result.affectedRows,
      insertId: result.insertId,
      duplicate: false
    };
  } catch (err) {
    return { success: false, error: err && err.message };
  }
  
}

}
async function recordPropertyViewHandler(req, res) {
  try {
    const idRaw = req.params.id;
    const propertyId = idRaw ? Number(String(idRaw).replace(/[^0-9]/g, '')) : null;

    if (!propertyId || Number.isNaN(propertyId)) {
      return res.status(400).json({ success: false, message: 'Missing or invalid property id' });
    }

    // Get session ID from middleware
    const sessionId = req.sessionId;

    // safe header parsing
    const ip = getClientIp(req);
    const userAgent = req.get ? (req.get('User-Agent') || null) : (req.headers && req.headers['user-agent']) || null;
    const referrer = req.get ? (req.get('Referrer') || req.get('Referer') || null) : (req.headers && (req.headers.referer || req.headers.referrer)) || null;

    // canonical payload for model
    const payload = {
      property_id: propertyId,
      slug: req.body?.slug ?? null,
      dedupe_key: sessionId, // Use session ID as primary dedupe key
      session_id: sessionId,
      source: req.body?.source ?? 'api',
      path: (req.body?.path ?? (req.originalUrl || req.path)) || null,
      referrer,
      ip,
      user_agent: userAgent,
      minutes_window: 1440, // 24 hour window for session deduplication
      event_type: 'view',
    };

    if (!Views || typeof Views.recordView !== 'function') {
      return res.status(500).json({ success: false, message: 'Server misconfiguration (views model missing)' });
    }

    const result = await Views.recordView(payload);
    // normalize result
    const recorded = !!(result && result.inserted);
    const deduped = result?.meta?.deduped || false;
    
    // Log for debugging
    if (recorded) {
      console.log(`[recordPropertyViewHandler] View recorded for property ${propertyId}, session: ${sessionId.slice(0,8)}...`);
    } else {
      console.log(`[recordPropertyViewHandler] View skipped (duplicate) for property ${propertyId}, session: ${sessionId.slice(0,8)}...`);
    }
    
    return res.json({
      success: true,
      recorded,
      meta: result?.meta ?? {},
      deduped,
      session_id: sessionId.slice(0,8) + '...' // Return partial session ID for debugging
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = Property;
