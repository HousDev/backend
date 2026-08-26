// models/RentalProperty.js
const db = require("../config/database");
const { v4: uuidv4 } = require("uuid");

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

class RentalProperty {
  /* =========================
     CREATE
     ========================= */
  static async create(data) {
    const [result] = await db.execute(
      `INSERT INTO rental_properties
       (owner_name, owner_id, assigned_to, property_type_name, property_subtype_name,
        unit_type, wing, unit_no, furnishing, balcony, bedrooms, bathrooms, facing,
        parking_type, parking_qty, city_name, location_name, society_name,
        floor, total_floors, carpet_area, builtup_area,
        address, status, lead_source, source_url,
        photos, amenities, furnishing_items, nearby_places,
        description, is_public, publication_date,
        listing_type, monthly_rent, security_deposit, maintenance_extra, maintenance_charge,
        preferred_tenants, lock_in_period, agreement_duration, available_from, latitude, longitude)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,

      [
        data.owner_name || null,
        data.owner_id || null,
        data.assigned_to || null,
        data.property_type_name || null,
        data.property_subtype_name || null,
        data.unit_type || null,
        data.wing || null,
        data.unit_no || null,
        data.furnishing || null,
        data.balcony || null,
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
        data.address || null,
        data.status || null,
        data.lead_source || null,
        data.source_url || null,
        data.photos ? JSON.stringify(data.photos) : null,
        data.amenities ? JSON.stringify(data.amenities) : null,
        data.furnishing_items ? JSON.stringify(data.furnishing_items) : null,
        data.nearby_places ? JSON.stringify(data.nearby_places) : null,
        data.description || null,
        typeof data.is_public === "boolean" ? (data.is_public ? 1 : 0) : 0,
        data.publication_date || null,
        data.listing_type || 'rent',
        data.monthly_rent || null,
        data.security_deposit || null,
        data.maintenance_extra ? 1 : 0,
        data.maintenance_charge || null,
        data.preferred_tenants || null,
        data.lock_in_period || null,
        data.agreement_duration || null,
        data.available_from || null,
        data.latitude || null,
        data.longitude || null,
      ],
    );
    return result.insertId;
  }

  static async updateSlug(id, slug) {
    const [r] = await db.execute(
      "UPDATE rental_properties SET slug = ? WHERE id = ?",
      [slug, id],
    );
    return r.affectedRows;
  }

  /* =========================
     READ
     ========================= */
  static async getAll() {
    const [rows] = await db.execute(`
      SELECT 
        p.*,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS executive_name,
        u.email  AS executive_email,
        u.phone  AS executive_phone,
        IFNULL(NULLIF(CONCAT_WS(' ', o.salutation, o.name), ''), p.owner_name) AS owner_name,
        o.email  AS owner_email,
        o.phone  AS owner_phone
      FROM rental_properties AS p
      LEFT JOIN users   AS u ON p.assigned_to = u.id
      LEFT JOIN owners  AS o ON p.owner_id   = o.id
      ORDER BY p.created_at DESC
    `);

    return rows.map((row) => {
      row.photos = safeJsonParse(row.photos, []);
      row.amenities = safeJsonParse(row.amenities, []);
      row.furnishing_items = safeJsonParse(row.furnishing_items, []);
      row.nearby_places = safeJsonParse(row.nearby_places, []);

      row.assignedTo = {
        id: row.assigned_to ?? null,
        name: row.executive_name || null,
        email: row.executive_email || null,
        phone: row.executive_phone || null,
      };

      row.owner = {
        id: row.owner_id ?? null,
        name: row.owner_name || null,
        email: row.owner_email || null,
        phone: row.owner_phone || null,
      };

      return row;
    });
  }

  static async getById(id) {
    const [rows] = await db.execute(
      `
      SELECT 
        p.*,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS executive_name,
        u.email  AS executive_email,
        u.phone  AS executive_phone,
        IFNULL(NULLIF(CONCAT_WS(' ', o.salutation, o.name), ''), p.owner_name) AS owner_name,
        o.email  AS owner_email,
        o.phone  AS owner_phone
      FROM rental_properties AS p
      LEFT JOIN users   AS u ON p.assigned_to = u.id
      LEFT JOIN owners  AS o ON p.owner_id   = o.id
      WHERE p.id = ?
      `,
      [id],
    );

    const property = rows[0];
    if (!property) return null;

    property.photos = safeJsonParse(property.photos, []);
    property.amenities = safeJsonParse(property.amenities, []);
    property.furnishing_items = safeJsonParse(property.furnishing_items, []);
    property.nearby_places = safeJsonParse(property.nearby_places, []);

    property.assignedTo = {
      id: property.assigned_to ?? null,
      name: property.executive_name || null,
      email: property.executive_email || null,
      phone: property.executive_phone || null,
    };

    property.owner = {
      id: property.owner_id ?? null,
      name: property.owner_name || null,
      email: property.owner_email || null,
      phone: property.owner_phone || null,
    };

    return property;
  }

  /* =========================
     UPDATE
     ========================= */
  static async update(id, data) {
    const existing = await this.getById(id);
    let updatedPhotos = data.photos || [];
    if (data.appendPhotos && existing?.photos) {
      updatedPhotos = [...existing.photos, ...updatedPhotos];
    }

    const [result] = await db.execute(
      `UPDATE rental_properties SET
        owner_name = ?, owner_id = ?, property_type_name = ?, property_subtype_name = ?,
        unit_type = ?, wing = ?, unit_no = ?, furnishing = ?, balcony = ?, bedrooms = ?, bathrooms = ?, facing = ?,
        parking_type = ?, parking_qty = ?, city_name = ?, location_name = ?, society_name = ?,
        floor = ?, total_floors = ?, carpet_area = ?, builtup_area = ?,
        address = ?, status = ?, lead_source = ?, source_url = ?,
        photos = ?, amenities = ?, furnishing_items = ?, nearby_places = ?,
        description = ?, is_public = COALESCE(?, is_public),
        publication_date = COALESCE(?, publication_date),
        listing_type = ?, monthly_rent = ?, security_deposit = ?,
        maintenance_extra = ?, maintenance_charge = ?, preferred_tenants = ?,
        lock_in_period = ?, agreement_duration = ?, available_from = ?,
        latitude = ?, longitude = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.owner_name || null,
        data.owner_id || null,
        data.property_type_name || null,
        data.property_subtype_name || null,
        data.unit_type || null,
        data.wing || null,
        data.unit_no || null,
        data.furnishing || null,
        data.balcony || null,
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
        data.address || null,
        data.status || null,
        data.lead_source || null,
        data.source_url || null,
        updatedPhotos.length ? JSON.stringify(updatedPhotos) : null,
        data.amenities ? JSON.stringify(data.amenities) : null,
        data.furnishing_items ? JSON.stringify(data.furnishing_items) : null,
        data.nearby_places ? JSON.stringify(data.nearby_places) : null,
        data.description || null,
        typeof data.is_public === "boolean" ? (data.is_public ? 1 : 0) : null,
        data.publication_date || null,
        data.listing_type || 'rent',
        data.monthly_rent || null,
        data.security_deposit || null,
        data.maintenance_extra ? 1 : 0,
        data.maintenance_charge || null,
        data.preferred_tenants || null,
        data.lock_in_period || null,
        data.agreement_duration || null,
        data.available_from || null,
        data.latitude || null,
        data.longitude || null,
        id,
      ],
    );
    return result.affectedRows;
  }

  /* =========================
     DELETE
     ========================= */
  static async delete(id) {
    const [result] = await db.execute("DELETE FROM rental_properties WHERE id = ?", [id]);
    return result.affectedRows;
  }

  static async addPhotos(propertyId, photoPaths) {
    const property = await this.getById(propertyId);
    if (!property) return 0;
    const current = property.photos || [];
    const next = [...current, ...photoPaths];
    const [result] = await db.execute(
      "UPDATE rental_properties SET photos = ? WHERE id = ?",
      [JSON.stringify(next), propertyId],
    );
    return result.affectedRows;
  }

  static async getPhotos(propertyId) {
    const prop = await this.getById(propertyId);
    return prop ? prop.photos || [] : [];
  }

  static async deletePhotos(propertyId) {
    const [result] = await db.execute(
      "UPDATE rental_properties SET photos = NULL WHERE id = ?",
      [propertyId],
    );
    return result.affectedRows;
  }

  static async deleteSpecificPhotos(propertyId, photosToDelete) {
    const property = await this.getById(propertyId);
    if (!property) return 0;
    const current = property.photos || [];
    const next = current.filter((p) => !photosToDelete.includes(p));
    const [result] = await db.execute(
      "UPDATE rental_properties SET photos = ? WHERE id = ?",
      [JSON.stringify(next), propertyId],
    );
    return result.affectedRows;
  }

  static async bulkUpdateStatus(propertyIds = [], status) {
    if (!propertyIds.length) return 0;
    const placeholders = propertyIds.map(() => "?").join(",");
    const [result] = await db.execute(
      `UPDATE rental_properties SET status = ? WHERE id IN (${placeholders})`,
      [status, ...propertyIds],
    );
    return result.affectedRows;
  }

  static async bulkMarkPublic(propertyIds = [], isPublic) {
    if (!propertyIds.length) return 0;
    const val = isPublic ? 1 : 0;
    const placeholders = propertyIds.map(() => "?").join(",");
    const [result] = await db.execute(
      `UPDATE rental_properties SET is_public = ? WHERE id IN (${placeholders})`,
      [val, ...propertyIds],
    );
    return result.affectedRows;
  }

  static async bulkDelete(propertyIds = []) {
    if (!propertyIds.length) return 0;
    const placeholders = propertyIds.map(() => "?").join(",");
    const [result] = await db.execute(
      `DELETE FROM rental_properties WHERE id IN (${placeholders})`,
      [...propertyIds],
    );
    return result.affectedRows;
  }

  static async togglePublic(id, isPublic) {
    const val = isPublic ? 1 : 0;
    const [result] = await db.execute(
      "UPDATE rental_properties SET is_public = ? WHERE id = ?",
      [val, id],
    );
    return result.affectedRows;
  }

  static async getMany(ids = []) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT * FROM rental_properties WHERE id IN (${placeholders})`,
      [...ids],
    );
    return rows.map((r) => {
      r.photos = safeJsonParse(r.photos, []);
      r.amenities = safeJsonParse(r.amenities, []);
      r.furnishing_items = safeJsonParse(r.furnishing_items, []);
      r.nearby_places = safeJsonParse(r.nearby_places, []);
      return r;
    });
  }

  static async updateAssignedTo(propertyId, assigned_to, assigned_by = null) {
    const [result] = await db.execute(
      "UPDATE rental_properties SET assigned_to = ? WHERE id = ?",
      [assigned_to || null, propertyId],
    );
    return result.affectedRows;
  }

  static async getSimilarProperties(opts = {}) {
    const { city, location, property_type, bedrooms, exclude_id, budget, limit = 5 } = opts;
    let sql = `
      SELECT p.*,
             CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS executive_name,
             u.email  AS executive_email,
             u.phone  AS executive_phone,
             IFNULL(NULLIF(CONCAT_WS(' ', o.salutation, o.name), ''), p.owner_name) AS owner_name,
             o.email  AS owner_email,
             o.phone  AS owner_phone
      FROM rental_properties AS p
      LEFT JOIN users   AS u ON p.assigned_to = u.id
      LEFT JOIN owners  AS o ON p.owner_id   = o.id
      WHERE p.status = 'Available'
    `;
    const params = [];

    if (city) {
      sql += " AND p.city_name = ?";
      params.push(city);
    }
    if (location) {
      sql += " AND p.location_name = ?";
      params.push(location);
    }
    if (property_type) {
      sql += " AND p.property_type_name = ?";
      params.push(property_type);
    }
    if (bedrooms != null) {
      sql += " AND p.bedrooms = ?";
      params.push(Number(bedrooms));
    }
    if (exclude_id) {
      sql += " AND p.id != ?";
      params.push(exclude_id);
    }

    sql += " ORDER BY p.created_at DESC LIMIT ?";
    params.push(Number(limit));

    const [rows] = await db.execute(sql, params);
    return rows.map((row) => {
      row.photos = safeJsonParse(row.photos, []);
      row.amenities = safeJsonParse(row.amenities, []);
      row.furnishing_items = safeJsonParse(row.furnishing_items, []);
      row.nearby_places = safeJsonParse(row.nearby_places, []);
      row.assignedTo = {
        id: row.assigned_to ?? null,
        name: row.executive_name || null,
        email: row.executive_email || null,
        phone: row.executive_phone || null,
      };
      row.owner = {
        id: row.owner_id ?? null,
        name: row.owner_name || null,
        email: row.owner_email || null,
        phone: row.owner_phone || null,
      };
      return row;
    });
  }

  static async getPopularLocations(limit = 5) {
    const [rows] = await db.execute(
      `SELECT location_name, COUNT(*) AS count 
       FROM rental_properties 
       WHERE location_name IS NOT NULL AND location_name != ''
       GROUP BY location_name 
       ORDER BY count DESC 
       LIMIT ?`,
      [Number(limit)],
    );
    return rows;
  }
}

module.exports = RentalProperty;
