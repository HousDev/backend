const pool = require("../config/database");

const toJsonOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) || (parsed && typeof parsed === "object")
        ? JSON.stringify(parsed)
        : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(v) || (v && typeof v === "object"))
    return JSON.stringify(v);
  return null;
};

const DocumentsGeneratedModel = {
  async create(payload) {
    const {
      template_id = null,
      name,
      description = null,
      category = null,
      content,
      variables = null,
      status = "draft",
      created_by = null,
      updated_by = null,
    } = payload;

    const sql = `
      INSERT INTO documents_generated
        (template_id, name, description, category, content, variables, status, created_by, updated_by)
      VALUES
        (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
    `;
    const params = [
      template_id,
      name,
      description,
      category,
      content,
      toJsonOrNull(variables),
      status,
      created_by,
      updated_by,
    ];
    const [res] = await pool.execute(sql, params);
    return { id: res.insertId };
  },

  async getAll(opts = {}) {
    const { includeDeleted = false, created_by = null } = opts;
    const where = [];
    const params = [];

    if (!includeDeleted) where.push("dg.is_deleted = 0");
    if (created_by != null) {
      where.push("dg.created_by = ?");
      params.push(created_by);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.execute(
      `
    SELECT
      dg.id,
      dg.template_id,
      dg.name,
      dg.description,
      dg.category,
      dg.content,
      dg.variables,
      dg.status,
      dg.created_by,
      dg.updated_by,
      dg.last_used_at,
      dg.is_deleted,
      dg.deleted_at,
      dg.created_at,
      dg.updated_at,

      /* PDF (generated) fields */
      dg.pdf_path,
      dg.pdf_url,
      dg.pdf_hash,
      dg.last_pdf_generated_at,

      /* Signed PDF fields */
      dg.signed_pdf_path,
      dg.signed_pdf_url,
      dg.signed_at,

      /* Original PDF fields */
      dg.original_pdf_path,
      dg.original_pdf_url,
      dg.original_sha256,
      dg.original_pdf_name,

      /* joined names */
      TRIM(CONCAT_WS(' ', u1.salutation, u1.first_name, u1.last_name)) AS created_by_name,
      TRIM(CONCAT_WS(' ', u2.salutation, u2.first_name, u2.last_name)) AS updated_by_name
    FROM documents_generated dg
    LEFT JOIN users u1 ON u1.id = dg.created_by
    LEFT JOIN users u2 ON u2.id = dg.updated_by
    ${whereSql}
    ORDER BY dg.created_at DESC
    `,
      params
    );

    return rows;
  },
  async getById(id) {
    const [rows] = await pool.execute(
      `
    SELECT
      dg.id,
      dg.template_id,
      dg.name,
      dg.description,
      dg.category,
      dg.content,
      dg.variables,
      dg.status,
      dg.created_by,
      dg.updated_by,
      dg.last_used_at,
      dg.is_deleted,
      dg.deleted_at,
      dg.created_at,
      dg.updated_at,

      /* PDF (generated) fields */
      dg.pdf_path,
      dg.pdf_url,
      dg.pdf_hash,
      dg.last_pdf_generated_at,

      /* Signed PDF fields */
      dg.signed_pdf_path,
      dg.signed_pdf_url,
      dg.signed_at,

      /* Original PDF fields */
      dg.original_pdf_path,
      dg.original_pdf_url,
      dg.original_sha256,
      dg.original_pdf_name,

      /* joined names */
      TRIM(CONCAT_WS(' ', u1.salutation, u1.first_name, u1.last_name)) AS created_by_name,
      TRIM(CONCAT_WS(' ', u2.salutation, u2.first_name, u2.last_name)) AS updated_by_name
    FROM documents_generated dg
    LEFT JOIN users u1 ON u1.id = dg.created_by
    LEFT JOIN users u2 ON u2.id = dg.updated_by
    WHERE dg.id = ?
    `,
      [id]
    );
    return rows[0] || null;
  },

  async update(id, patch = {}) {
    const sets = [];
    const params = [];
    const push = (field, value, isJson = false) => {
      sets.push(`${field} = ${isJson ? "CAST(? AS JSON)" : "?"}`);
      params.push(value);
    };

    // Core fields
    if (patch.template_id !== undefined) push("template_id", patch.template_id);
    if (patch.name !== undefined) push("name", patch.name);
    if (patch.description !== undefined) push("description", patch.description);
    if (patch.category !== undefined) push("category", patch.category);
    if (patch.content !== undefined) push("content", patch.content);
    if (patch.variables !== undefined)
      push("variables", toJsonOrNull(patch.variables), true);
    if (patch.status !== undefined) push("status", patch.status);
    if (patch.created_by !== undefined) push("created_by", patch.created_by); // optional
    if (patch.updated_by !== undefined) push("updated_by", patch.updated_by);
    if (patch.last_used_at !== undefined)
      push("last_used_at", patch.last_used_at);

    // Generated PDF fields
    if (patch.pdf_path !== undefined) push("pdf_path", patch.pdf_path);
    if (patch.pdf_url !== undefined) push("pdf_url", patch.pdf_url);
    if (patch.pdf_hash !== undefined) push("pdf_hash", patch.pdf_hash);
    if (patch.last_pdf_generated_at !== undefined)
      push("last_pdf_generated_at", patch.last_pdf_generated_at);

    // Signed PDF fields
    if (patch.signed_pdf_path !== undefined)
      push("signed_pdf_path", patch.signed_pdf_path);
    if (patch.signed_pdf_url !== undefined)
      push("signed_pdf_url", patch.signed_pdf_url);
    if (patch.signed_at !== undefined) push("signed_at", patch.signed_at);

    // Original PDF fields
    if (patch.original_pdf_path !== undefined)
      push("original_pdf_path", patch.original_pdf_path);
    if (patch.original_pdf_url !== undefined)
      push("original_pdf_url", patch.original_pdf_url);
    if (patch.original_sha256 !== undefined)
      push("original_sha256", patch.original_sha256);
    if (patch.original_pdf_name !== undefined)
      push("original_pdf_name", patch.original_pdf_name);

    // NOTE: not touching is_deleted / deleted_at here (use softDelete/restore)

    if (!sets.length) return { affectedRows: 0 };

    // Always refresh updated_at if anything changed
    sets.push("updated_at = CURRENT_TIMESTAMP");

    const sql = `UPDATE documents_generated SET ${sets.join(
      ", "
    )} WHERE id = ?`;
    const [res] = await pool.execute(sql, [...params, id]);
    return { affectedRows: res.affectedRows };
  },
  async softDelete(id, userId = null) {
    const [res] = await pool.execute(
      `UPDATE documents_generated
         SET is_deleted = 1,
             deleted_at = CURRENT_TIMESTAMP,
             updated_by = COALESCE(?, updated_by)
       WHERE id = ?`,
      [userId, id]
    );
    return { affectedRows: res.affectedRows };
  },

  async restore(id, userId = null) {
    const [res] = await pool.execute(
      `UPDATE documents_generated
         SET is_deleted = 0,
             deleted_at = NULL,
             updated_by = COALESCE(?, updated_by)
       WHERE id = ?`,
      [userId, id]
    );
    return { affectedRows: res.affectedRows };
  },

  async hardDelete(id) {
    const [res] = await pool.execute(
      `DELETE FROM documents_generated WHERE id = ?`,
      [id]
    );
    return { affectedRows: res.affectedRows };
  },
};

module.exports = DocumentsGeneratedModel;
