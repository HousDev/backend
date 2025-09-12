// models/Property.js
const db = require("../config/database");

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
       (seller_name, property_type_name, property_subtype_name,
        unit_type, wing, unit_no, furnishing,
        parking_type, parking_qty, city_name, location_name, society_name,
        floor, total_floors, carpet_area, builtup_area, budget,
        address, status, lead_source,
        possession_month, possession_year,
        purchase_month, purchase_year,
        selling_rights, ownership_doc_path,
        photos, amenities, furnishing_items, nearby_places,
        description, is_public, publication_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, ?)`,
      [
        data.seller_name || null,
        data.property_type_name || null,
        data.property_subtype_name || null,
        data.unit_type || null,
        data.wing || null,
        data.unit_no || null,
        data.furnishing || null,
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
        seller_name = ?, property_type_name = ?, property_subtype_name = ?,
        unit_type = ?, wing = ?, unit_no = ?, furnishing = ?,
        parking_type = ?, parking_qty = ?, city_name = ?, location_name = ?, society_name = ?,
        floor = ?, total_floors = ?, carpet_area = ?, builtup_area = ?, budget = ?,
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
        data.property_type_name || null,
        data.property_subtype_name || null,
        data.unit_type || null,
        data.wing || null,
        data.unit_no || null,
        data.furnishing || null,
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
}

module.exports = Property;
