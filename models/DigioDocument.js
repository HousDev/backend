// models/DigioDocument.js
const pool = require("../config/database");

const DigioDocument = {
  /**
   * Upsert using Digio "create/upload" response
   */
  async upsertFromResponse(resp) {
    const digio_id = resp?.id;
    if (!digio_id) throw new Error("digio_id (response.id) missing");

    const file_name = resp.file_name || null;
    const status = resp.agreement_status || null;
    const signers = resp.signing_parties || [];
    const access_token_id = resp.access_token?.id || null;

    const authUrls = {};
    if (Array.isArray(signers)) {
      for (const s of signers) {
        if (s?.identifier && s?.authentication_url) {
          authUrls[s.identifier] = s.authentication_url;
        }
      }
    }

    const sql = `
      INSERT INTO digio_documents
      (digio_id, file_name, status, signers, access_token_id, authentication_urls, response_json)
      VALUES (?, ?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        file_name = VALUES(file_name),
        status = VALUES(status),
        signers = VALUES(signers),
        access_token_id = VALUES(access_token_id),
        authentication_urls = VALUES(authentication_urls),
        response_json = VALUES(response_json),
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      digio_id,
      file_name,
      status,
      JSON.stringify(signers),
      access_token_id,
      JSON.stringify(authUrls),
      JSON.stringify(resp),
    ];

    await pool.execute(sql, params);
    return { digio_id, status, file_name, access_token_id };
  },

  /**
   * Upsert using Digio "details" response (GET /v2/client/document/:id)
   */
  async upsertFromDetails(resp) {
    // details API usually also returns id, agreement_status, file_name, signing_parties, etc.
    return this.upsertFromResponse(resp);
  },

  /**
   * Update only status & response_json (useful after cancel)
   */
  async setStatusAndSnapshot(digio_id, status, snapshot) {
    const sql = `
      UPDATE digio_documents
      SET status = ?, response_json = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP
      WHERE digio_id = ?
    `;
    await pool.execute(sql, [status || null, JSON.stringify(snapshot || null), digio_id]);
  },
};

module.exports = DigioDocument;
