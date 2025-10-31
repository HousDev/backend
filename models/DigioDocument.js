// models/DigioDocument.js
const pool = require("../config/database");

const DigioDocument = {
  /**
   * Upsert using Digio "create/upload" response
   * @param {object} resp - Digio response (must contain id)
   * @param {number|string} localDocumentId - your CRM document id
   */
  async upsertFromResponse(resp, localDocumentId) {
    const digio_id = resp?.id;
    if (!digio_id) throw new Error("digio_id (response.id) missing");

    // tolerate both shapes { access_token: {id} } or { access_token_id }
    const access_token_id =
      resp?.access_token?.id || resp?.access_token_id || null;

    const file_name = resp?.file_name || null;
    const status = resp?.agreement_status || resp?.status || null;
    const signers = Array.isArray(resp?.signing_parties)
      ? resp.signing_parties
      : [];

    // build authentication_urls map { identifier: url }
    const authUrls = {};
    for (const s of signers) {
      if (s?.identifier && (s.authentication_url || s.auth_url)) {
        authUrls[s.identifier] = s.authentication_url || s.auth_url;
      }
    }

    // NOTE: local_document_id included in the INSERT + ON DUPLICATE UPDATE
    const sql = `
      INSERT INTO digio_documents
      (local_document_id, digio_id, file_name, status, signers, access_token_id, authentication_urls, response_json)
      VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        local_document_id   = VALUES(local_document_id),
        file_name           = VALUES(file_name),
        status              = VALUES(status),
        signers             = VALUES(signers),
        access_token_id     = VALUES(access_token_id),
        authentication_urls = VALUES(authentication_urls),
        response_json       = VALUES(response_json),
        updated_at          = CURRENT_TIMESTAMP
    `;

    const params = [
      localDocumentId ?? null,
      digio_id,
      file_name,
      status,
      JSON.stringify(signers),
      access_token_id,
      JSON.stringify(authUrls),
      JSON.stringify(resp),
    ];

    await pool.execute(sql, params);
    return { digio_id, status, file_name, access_token_id, local_document_id: localDocumentId ?? null };
  },

  /**
   * Upsert using Digio "details" response (GET /v2/client/document/:id)
   * Keep localDocumentId optional (null won't break)
   */
  async upsertFromDetails(resp, localDocumentId = null) {
    return this.upsertFromResponse(resp, localDocumentId);
  },

  /**
   * Link/relate an existing row to a local_document_id
   * Useful if you saved row earlier without localDocumentId
   */
  async linkLocalDocument(digio_id, localDocumentId) {
    if (!digio_id) throw new Error("digio_id required");
    if (localDocumentId == null) throw new Error("localDocumentId required");

    const sql = `
      UPDATE digio_documents
      SET local_document_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE digio_id = ?
    `;
    await pool.execute(sql, [localDocumentId, digio_id]);
  },

  /**
   * Update only status & response_json (useful after cancel or webhook updates)
   */
  async setStatusAndSnapshot(digio_id, status, snapshot) {
    const sql = `
      UPDATE digio_documents
      SET status = ?, response_json = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP
      WHERE digio_id = ?
    `;
    await pool.execute(sql, [status || null, JSON.stringify(snapshot ?? null), digio_id]);
  },
  /** Row by digio_id */
  async getByDigioId(digio_id) {
    const [rows] = await pool.execute(
      `SELECT * FROM digio_documents WHERE digio_id = ? LIMIT 1`,
      [digio_id]
    );
    return rows?.[0] || null;
  },

  /** Row by local_document_id */
  async getByLocalId(local_document_id) {
    const [rows] = await pool.execute(
      `SELECT * FROM digio_documents WHERE local_document_id = ? ORDER BY updated_at DESC LIMIT 1`,
      [local_document_id]
    );
    return rows?.[0] || null;
  },
  /**
   * List all Digio documents with pagination, filters, and sorting
   * @param {object} opts
   * @param {number} [opts.page=1]            1-based page
   * @param {number} [opts.limit=20]          page size
   * @param {string} [opts.q]                 text search (digio_id, file_name, access_token_id, local_document_id)
   * @param {string} [opts.status]            filter by status
   * @param {string} [opts.from]              ISO date string (created_at >= from)
   * @param {string} [opts.to]                ISO date string (created_at <= to)
   * @param {string} [opts.orderBy=updated_at] whitelist: updated_at|created_at|file_name|status|local_document_id
   * @param {"ASC"|"DESC"} [opts.order=DESC]
   */
  async list(opts = {}) {
    const {
      page = 1,
      limit = 20,
      q,
      status,
      from,
      to,
      orderBy = "updated_at",
      order = "DESC",
    } = opts;

    // whitelist orderBy + order
    const ORDERABLE = new Set(["updated_at", "created_at", "file_name", "status", "local_document_id"]);
    const orderCol = ORDERABLE.has(orderBy) ? orderBy : "updated_at";
    const orderDir = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const where = [];
    const params = [];

    if (q) {
      // search multiple columns
      where.push(`(digio_id LIKE ? OR file_name LIKE ? OR access_token_id LIKE ? OR CAST(local_document_id AS CHAR) LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (status) {
      where.push(`status = ?`);
      params.push(status);
    }
    if (from) {
      where.push(`created_at >= ?`);
      params.push(from);
    }
    if (to) {
      where.push(`created_at <= ?`);
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const pageSize = Math.max(1, Number(limit));

    const sqlRows = `
      SELECT
        id,
        local_document_id,
        digio_id,
        file_name,
        status,
        signers,
        access_token_id,
        authentication_urls,
        created_at,
        updated_at
      FROM digio_documents
      ${whereSql}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT ? OFFSET ?
    `;

    const sqlCount = `
      SELECT COUNT(1) AS cnt
      FROM digio_documents
      ${whereSql}
    `;

    // Count first (re-use where params)
    const [countRows] = await pool.execute(sqlCount, params);
    const total = Number(countRows?.[0]?.cnt || 0);

    // Rows (append limit & offset to params copy)
    const rowsParams = params.slice();
    rowsParams.push(pageSize, offset);
    const [rows] = await pool.execute(sqlRows, rowsParams);

    return {
      page: Number(page),
      limit: pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      data: rows,
    };
  },
  async getAll() {
    const [rows] = await pool.execute(
      `SELECT * FROM digio_documents ORDER BY updated_at DESC`
    );
    return rows;
  },
};

module.exports = DigioDocument;
