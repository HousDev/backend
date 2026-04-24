const db = require("../config/database");

const Campaign = {
  // Get all campaigns
  findAll: async () => {
    const [rows] = await db.query(`
      SELECT c.*, 
             JSON_OBJECT('id', t.id, 'name', t.name, 'body', t.body, 'category', t.category) as template
      FROM campaigns c
      LEFT JOIN templates_wa t ON c.template_id = t.id
      ORDER BY c.created_at DESC
    `);

    return rows.map((row) => ({
      ...row,
      // The JSON_OBJECT in MySQL returns a JSON string, but we need to check if it's already parsed
      template: row.template
        ? typeof row.template === "string"
          ? JSON.parse(row.template)
          : row.template
        : null,
      filters: row.filters
        ? typeof row.filters === "string"
          ? JSON.parse(row.filters)
          : row.filters
        : {},
      audience_filters: row.audience_filters
        ? typeof row.audience_filters === "string"
          ? JSON.parse(row.audience_filters)
          : row.audience_filters
        : {},
      selected_contact_ids: row.selected_contact_ids
        ? typeof row.selected_contact_ids === "string"
          ? JSON.parse(row.selected_contact_ids)
          : row.selected_contact_ids
        : [],
      uploaded_contacts: row.uploaded_contacts
        ? typeof row.uploaded_contacts === "string"
          ? JSON.parse(row.uploaded_contacts)
          : row.uploaded_contacts
        : [],
      template_variables: row.template_variables
        ? typeof row.template_variables === "string"
          ? JSON.parse(row.template_variables)
          : row.template_variables
        : [],
      carousel_media: row.carousel_media
        ? typeof row.carousel_media === "string"
          ? JSON.parse(row.carousel_media)
          : row.carousel_media
        : [],
    }));
  },

  // Get campaign by ID
  findById: async (id) => {
    const [rows] = await db.query(
      `
      SELECT c.*, 
             JSON_OBJECT('id', t.id, 'name', t.name, 'body', t.body, 'category', t.category) as template
      FROM campaigns c
      LEFT JOIN templates_wa t ON c.template_id = t.id
      WHERE c.id = ?
      `,
      [id],
    );

    if (rows.length === 0) return null;
    const row = rows[0];

    return {
      ...row,
      // Check if template is already an object or needs parsing
      template: row.template
        ? typeof row.template === "string"
          ? JSON.parse(row.template)
          : row.template
        : null,
      filters: row.filters
        ? typeof row.filters === "string"
          ? JSON.parse(row.filters)
          : row.filters
        : {},
      audience_filters: row.audience_filters
        ? typeof row.audience_filters === "string"
          ? JSON.parse(row.audience_filters)
          : row.audience_filters
        : {},
      selected_contact_ids: row.selected_contact_ids
        ? typeof row.selected_contact_ids === "string"
          ? JSON.parse(row.selected_contact_ids)
          : row.selected_contact_ids
        : [],
      uploaded_contacts: row.uploaded_contacts
        ? typeof row.uploaded_contacts === "string"
          ? JSON.parse(row.uploaded_contacts)
          : row.uploaded_contacts
        : [],
      template_variables: row.template_variables
        ? typeof row.template_variables === "string"
          ? JSON.parse(row.template_variables)
          : row.template_variables
        : [],
      carousel_media: row.carousel_media
        ? typeof row.carousel_media === "string"
          ? JSON.parse(row.carousel_media)
          : row.carousel_media
        : [],
    };
  },

  // Create new campaign
  create: async (data) => {
    const {
      name,
      template_id,
      status,
      scheduled_at,
      total_contacts,
      filters,
      audience_mode,
      audience_filters,
      selected_contact_ids,
      uploaded_contacts,
      template_variables,
      media_url,
      carousel_media,
      estimated_cost,
    } = data;

    const [result] = await db.query(
      `
      INSERT INTO campaigns 
      (name, template_id, status, scheduled_at, total_contacts, 
       filters, audience_mode, audience_filters, selected_contact_ids,
       uploaded_contacts, template_variables, media_url, 
       carousel_media, estimated_cost, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        name,
        template_id,
        status || "draft",
        scheduled_at || null,
        total_contacts || 0,
        filters ? JSON.stringify(filters) : JSON.stringify({}),
        audience_mode || "segment",
        audience_filters
          ? JSON.stringify(audience_filters)
          : JSON.stringify({}),
        selected_contact_ids
          ? JSON.stringify(selected_contact_ids)
          : JSON.stringify([]),
        uploaded_contacts
          ? JSON.stringify(uploaded_contacts)
          : JSON.stringify([]),
        template_variables
          ? JSON.stringify(template_variables)
          : JSON.stringify([]),
        media_url || null,
        carousel_media ? JSON.stringify(carousel_media) : JSON.stringify([]),
        estimated_cost || 0,
      ],
    );
    return result.insertId;
  },

  // Update campaign
  update: async (id, data) => {
    const fields = [];
    const values = [];

    const allowedFields = [
      "name",
      "template_id",
      "status",
      "scheduled_at",
      "total_contacts",
      "sent_count",
      "delivered_count",
      "read_count",
      "failed_count",
      "filters",
      "audience_mode",
      "audience_filters",
      "selected_contact_ids",
      "uploaded_contacts",
      "template_variables",
      "media_url",
      "carousel_media",
      "estimated_cost",
    ];

    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key) && value !== undefined) {
        if (
          [
            "filters",
            "audience_filters",
            "selected_contact_ids",
            "uploaded_contacts",
            "template_variables",
            "carousel_media",
          ].includes(key)
        ) {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    await db.query(
      `UPDATE campaigns SET ${fields.join(", ")}, updated_at = NOW() WHERE id = ?`,
      values,
    );
    return Campaign.findById(id);
  },

  // Delete campaign
  delete: async (id) => {
    await db.query("DELETE FROM campaigns WHERE id = ?", [id]);
    return true;
  },

  // Update campaign stats
  updateStats: async (id, sent, delivered, read, failed) => {
    await db.query(
      `UPDATE campaigns SET 
        sent_count = sent_count + ?,
        delivered_count = delivered_count + ?,
        read_count = read_count + ?,
        failed_count = failed_count + ?
      WHERE id = ?`,
      [sent || 0, delivered || 0, read || 0, failed || 0, id],
    );
    return Campaign.findById(id);
  },
};

module.exports = Campaign;