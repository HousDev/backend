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

const DUMMY_RENTAL_PROPERTIES = [
  {
    owner_name: "Prerana",
    title: "Luxury 2 BHK Apartment in Wakad",
    property_type_name: "2 BHK",
    monthly_rent: 28000,
    expected_rent: 28000,
    security_deposit: 56000,
    location_name: "Wakad",
    city_name: "Pune",
    society_name: "Kaspate Wasti, Wakad",
    address: "Kaspate Wasti, Wakad, Pune, Maharashtra 411057",
    furnishing: "Semi Furnished",
    carpet_area: 850,
    builtup_area: 1050,
    bedrooms: 2,
    bathrooms: 2,
    balcony: 2,
    listing_type: "rent",
    status: "Available",
    is_public: 1,
    photos: JSON.stringify(["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80"]),
    amenities: JSON.stringify(["Parking", "Lift", "Security", "WiFi", "Gym"]),
    nearby_places: JSON.stringify([{ label: "Metro", distance: "800m" }, { label: "D-Mart", distance: "1km" }]),
  },
  {
    owner_name: "Pream",
    title: "Modern 1 BHK Smart Home near IT Park",
    property_type_name: "1 BHK",
    monthly_rent: 18500,
    expected_rent: 18500,
    security_deposit: 37000,
    location_name: "Hinjewadi",
    city_name: "Pune",
    society_name: "Rajiv Gandhi IT Park Area",
    address: "Phase 1, Hinjewadi, Pune, Maharashtra 411057",
    furnishing: "Fully Furnished",
    carpet_area: 620,
    builtup_area: 750,
    bedrooms: 1,
    bathrooms: 1,
    balcony: 1,
    listing_type: "rent",
    status: "Available",
    is_public: 1,
    photos: JSON.stringify(["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80"]),
    amenities: JSON.stringify(["Parking", "Security", "WiFi", "Water"]),
    nearby_places: JSON.stringify([{ label: "IT Park", distance: "500m" }, { label: "Hospital", distance: "1.5km" }]),
  },
  {
    owner_name: "Pranjali",
    title: "Spacious 3 BHK Family Residence in Baner",
    property_type_name: "3 BHK",
    monthly_rent: 38000,
    expected_rent: 38000,
    security_deposit: 76000,
    location_name: "Baner",
    city_name: "Pune",
    society_name: "Pan Card Club Road",
    address: "Pan Card Club Road, Baner, Pune, Maharashtra 411045",
    furnishing: "Fully Furnished",
    carpet_area: 1250,
    builtup_area: 1500,
    bedrooms: 3,
    bathrooms: 3,
    balcony: 3,
    listing_type: "rent",
    status: "Available",
    is_public: 1,
    photos: JSON.stringify(["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80"]),
    amenities: JSON.stringify(["Parking", "Lift", "Security", "Garden", "Gym", "Power Backup"]),
    nearby_places: JSON.stringify([{ label: "School", distance: "500m" }, { label: "Mall", distance: "2km" }]),
  },
  {
    owner_name: "Shree",
    title: "Premium 2 BHK Gated Community Residence",
    property_type_name: "2 BHK",
    monthly_rent: 24500,
    expected_rent: 24500,
    security_deposit: 49000,
    location_name: "Tathawade",
    city_name: "Pune",
    society_name: "Near JSPM College Campus",
    address: "JSPM Road, Tathawade, Pune, Maharashtra 411033",
    furnishing: "Semi Furnished",
    carpet_area: 920,
    builtup_area: 1100,
    bedrooms: 2,
    bathrooms: 2,
    balcony: 2,
    listing_type: "rent",
    status: "Available",
    is_public: 1,
    photos: JSON.stringify(["https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"]),
    amenities: JSON.stringify(["Parking", "Lift", "Security", "Clubhouse"]),
    nearby_places: JSON.stringify([{ label: "College", distance: "400m" }, { label: "Market", distance: "600m" }]),
  },
  {
    owner_name: "Sumit",
    title: "Studio Apartment with Modern Amenities",
    property_type_name: "Studio",
    monthly_rent: 14000,
    expected_rent: 14000,
    security_deposit: 28000,
    location_name: "Rahatani",
    city_name: "Pune",
    society_name: "Main Chowk Area",
    address: "Rahatani Main Road, Pune, Maharashtra 411017",
    furnishing: "Fully Furnished",
    carpet_area: 450,
    builtup_area: 550,
    bedrooms: 1,
    bathrooms: 1,
    balcony: 1,
    listing_type: "rent",
    status: "Available",
    is_public: 1,
    photos: JSON.stringify(["https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80"]),
    amenities: JSON.stringify(["Parking", "Security", "WiFi"]),
    nearby_places: JSON.stringify([{ label: "Bus Stop", distance: "200m" }, { label: "Market", distance: "500m" }]),
  },
];

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
        preferred_tenants, lock_in_period, notice_period, agreement_duration, available_from, latitude, longitude)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,

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
        data.notice_period || null,
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
    let rows = [];
    try {
      const [dbRows] = await db.execute(`
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
      rows = dbRows || [];

      if (rows.length === 0) {
        for (const item of DUMMY_RENTAL_PROPERTIES) {
          try {
            await RentalProperty.create(item);
          } catch (e) {
            // ignore
          }
        }
        const [seededRows] = await db.execute(`
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
        rows = seededRows || [];
      }
    } catch (err) {
      console.error("Error in RentalProperty.getAll db query:", err.message);
    }

    if (!rows || rows.length === 0) {
      rows = DUMMY_RENTAL_PROPERTIES;
    }

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
        lock_in_period = ?, notice_period = ?, agreement_duration = ?, available_from = ?,
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
        data.notice_period || null,
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
    try {
      const { city, location, property_type, bedrooms, exclude_id, propertyId, limit = 6 } = opts;
      const targetExclude = exclude_id || propertyId || null;
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
        WHERE 1=1
      `;
      const params = [];

      if (targetExclude) {
        sql += " AND p.id != ?";
        params.push(Number(targetExclude));
      }
      if (city) {
        sql += " AND (p.city_name LIKE ? OR p.city_name IS NULL)";
        params.push(`%${city}%`);
      }
      if (bedrooms != null && !isNaN(Number(bedrooms))) {
        sql += " AND p.bedrooms = ?";
        params.push(Number(bedrooms));
      }

      const safeLimit = Math.max(1, Math.min(50, Number(limit) || 6));
      sql += ` ORDER BY p.id DESC LIMIT ${safeLimit}`;

      const [rows] = await db.query(sql, params);
      return (rows || []).map((row) => {
        row.photos = safeJsonParse(row.photos, []);
        row.amenities = safeJsonParse(row.amenities, []);
        row.furnishing_items = safeJsonParse(row.furnishing_items, []);
        row.nearby_places = safeJsonParse(row.nearby_places, []);
        row.assignedTo = {
          id: row.assigned_to ?? null,
          name: row.executive_name?.trim() || null,
          email: row.executive_email ?? null,
          phone: row.executive_phone ?? null,
        };
        row.owner = {
          id: row.owner_id ?? null,
          name: row.owner_name?.trim() || null,
          email: row.owner_email ?? null,
          phone: row.owner_phone ?? null,
        };
        return row;
      });
    } catch (err) {
      console.error("RentalProperty.getSimilarProperties error:", err);
      return [];
    }
  }

  static async getPopularLocations(limit = 5) {
    try {
      const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));
      const [rows] = await db.query(
        `SELECT location_name, COUNT(*) AS count 
         FROM rental_properties 
         WHERE location_name IS NOT NULL AND location_name != ''
         GROUP BY location_name 
         ORDER BY count DESC 
         LIMIT ${safeLimit}`
      );
      return rows;
    } catch (err) {
      console.error("RentalProperty.getPopularLocations error:", err);
      return [];
    }
  }
}

module.exports = RentalProperty;
