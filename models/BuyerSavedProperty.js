const pool = require("../config/database");
const run = (sql, params = []) => pool.query(sql, params);

// JSON/string fields ko safely parse/normalize
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

/* -------------------------------------------
   Columns selected from my_properties (p)
   + assigned_to user details (u)
-------------------------------------------- */
const PROPERTY_COLS = `
  p.id, p.seller_name, p.seller_id, p.lead_id, p.assigned_to,
  p.property_type_name, p.property_subtype_name, p.unit_type, p.wing, p.unit_no,
  p.furnishing, p.bedrooms, p.bathrooms, p.facing, p.parking_type, p.parking_qty,
  p.city_name, p.location_name, p.society_name, p.floor, p.total_floors,
  p.carpet_area, p.builtup_area, p.budget, p.price_type, p.final_price,
  p.address, p.status, p.lead_source, p.possession_month, p.possession_year,
  p.purchase_month, p.purchase_year, p.selling_rights,
  p.photos, p.amenities, p.furnishing_items, p.nearby_places, p.description,
  p.created_at, p.updated_at, p.is_public, p.is_private, p.is_sold, p.is_available,
  p.is_new_listing, p.is_premium, p.is_verified, p.is_featured, p.publication_date,
  p.created_by, p.updated_by, p.public_views, p.public_inquiries, p.slug,

  /* ---- assigned_to user fields (nullable) ---- */
  u.id   AS assigned_user_id,
  u.salutation AS assigned_user_salutation,
  u.first_name AS assigned_user_first_name,
  u.last_name  AS assigned_user_last_name,
  u.email      AS assigned_user_email,
  u.phone      AS assigned_user_phone
`;

/* Map a single property row (+ optional assigned user) */
const mapPropertyRow = (r) => {
  const assigned_user_name = [
    r.assigned_user_salutation,
    r.assigned_user_first_name,
    r.assigned_user_last_name,
  ].filter(Boolean).join(" ").trim() || null;

  return {
    id: r.id,
    seller_name: r.seller_name,
    seller_id: r.seller_id,
    lead_id: r.lead_id,
    assigned_to: r.assigned_to,

    /* attached assigned_to user object (if exists) */
    assigned_to_user: r.assigned_user_id ? {
      id: r.assigned_user_id,
      name: assigned_user_name,
      email: r.assigned_user_email || null,
      phone: r.assigned_user_phone || null,
      salutation: r.assigned_user_salutation || null,
      first_name: r.assigned_user_first_name || null,
      last_name: r.assigned_user_last_name || null,
    } : null,

    property_type_name: r.property_type_name,
    property_subtype_name: r.property_subtype_name,
    unit_type: r.unit_type,
    wing: r.wing,
    unit_no: r.unit_no,
    furnishing: r.furnishing,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    facing: r.facing,
    parking_type: r.parking_type,
    parking_qty: r.parking_qty,
    city_name: r.city_name,
    location_name: r.location_name,
    society_name: r.society_name,
    floor: r.floor,
    total_floors: r.total_floors,
    carpet_area: r.carpet_area,
    builtup_area: r.builtup_area,
    budget: r.budget,
    price_type: r.price_type,
    final_price: r.final_price,
    address: r.address,
    status: r.status,
    lead_source: r.lead_source,
    possession_month: r.possession_month,
    possession_year: r.possession_year,
    purchase_month: r.purchase_month,
    purchase_year: r.purchase_year,
    selling_rights: r.selling_rights,
    photos: safeParse(r.photos),
    amenities: safeParse(r.amenities),
    furnishing_items: safeParse(r.furnishing_items),
    nearby_places: safeParse(r.nearby_places),
    description: r.description,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_public: !!r.is_public,
    is_private: !!r.is_private,
    is_sold: !!r.is_sold,
    is_available: !!r.is_available,
    is_new_listing: !!r.is_new_listing,
    is_premium: !!r.is_premium,
    is_verified: !!r.is_verified,
    is_featured: !!r.is_featured,
    publication_date: r.publication_date,
    created_by: r.created_by,
    updated_by: r.updated_by,
    public_views: r.public_views,
    public_inquiries: r.public_inquiries,
    slug: r.slug,
  };
};

const BuyerSavedProperty = {
  async save(buyerId, propertyId) {
    const sql = `
      INSERT INTO buyer_saved_properties (buyer_id, property_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE created_at = created_at
    `;
    await run(sql, [buyerId, propertyId]);
    const [rows] = await run(
      `SELECT * FROM buyer_saved_properties WHERE buyer_id=? AND property_id=? LIMIT 1`,
      [buyerId, propertyId]
    );
    return rows[0] || null;
  },

  async removeByPair(buyerId, propertyId) {
    const [res] = await run(
      `DELETE FROM buyer_saved_properties WHERE buyer_id=? AND property_id=?`,
      [buyerId, propertyId]
    );
    return res.affectedRows || 0;
  },

  async removeById(id) {
    const [res] = await run(`DELETE FROM buyer_saved_properties WHERE id=?`, [id]);
    return res.affectedRows || 0;
  },

  async isSaved(buyerId, propertyId) {
    const [rows] = await run(
      `SELECT id FROM buyer_saved_properties WHERE buyer_id=? AND property_id=? LIMIT 1`,
      [buyerId, propertyId]
    );
    return !!rows[0];
  },

  async listByBuyer(buyerId, { limit = 50, offset = 0, includeProperty = false } = {}) {
    if (includeProperty) {
      const [rows] = await run(
        `
        SELECT bsp.*,
               ${PROPERTY_COLS}
        FROM buyer_saved_properties bsp
        JOIN my_properties p ON p.id = bsp.property_id
        LEFT JOIN users u ON u.id = p.assigned_to
        WHERE bsp.buyer_id = ?
        ORDER BY bsp.created_at DESC
        LIMIT ? OFFSET ?
        `,
        [buyerId, Number(limit), Number(offset)]
      );
      return rows.map((r) => ({
        id: r.id,
        buyer_id: r.buyer_id,
        property_id: r.property_id,
        created_at: r.created_at,
        property: mapPropertyRow(r),
      }));
    }
    const [rows] = await run(
      `SELECT * FROM buyer_saved_properties WHERE buyer_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [buyerId, Number(limit), Number(offset)]
    );
    return rows;
  },

  async countByProperty(propertyId) {
    const [rows] = await run(
      `SELECT COUNT(*) AS cnt FROM buyer_saved_properties WHERE property_id=?`,
      [propertyId]
    );
    return rows[0]?.cnt || 0;
  },

  // ✅ 1) Sirf property ka full data (+ assigned_to user)
  async getPropertyById(propertyId) {
    const [rows] = await run(
      `
      SELECT ${PROPERTY_COLS}
      FROM my_properties p
      LEFT JOIN users u ON u.id = p.assigned_to
      WHERE p.id = ?
      LIMIT 1
      `,
      [propertyId]
    );
    const row = rows?.[0];
    return row ? mapPropertyRow(row) : null;
  },

  // ✅ 2) Property + jinh buyers ne save kiya (buyers array)
  async getByPropertyId(propertyId) {
    // property
    const property = await this.getPropertyById(propertyId);
    if (!property) return null;

    // saved-by buyers  (SQL alias bug fixed; name compose in JS)
    const [buyers] = await run(
      `
      SELECT
        b.id,
        b.salutation,
        b.first_name,
        b.last_name,
        b.phone,
        b.email,
        bsp.created_at AS saved_at
      FROM buyer_saved_properties bsp
      JOIN buyers b ON b.id = bsp.buyer_id
      WHERE bsp.property_id = ?
      ORDER BY bsp.created_at DESC
      `,
      [propertyId]
    );

    const saved_by = buyers.map((b) => {
      const fullName = [b.salutation, b.first_name, b.last_name].filter(Boolean).join(" ").trim() || null;
      return {
        id: b.id,
        name: fullName,
        phone: b.phone || null,
        email: b.email || null,
        saved_at: b.saved_at,
        salutation: b.salutation || null,
        first_name: b.first_name || null,
        last_name: b.last_name || null,
      };
    });

    return { property, saved_by };
  },
};

module.exports = BuyerSavedProperty;
