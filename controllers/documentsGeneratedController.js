// controllers/documentsGeneratedController.js
const Model = require('../models/documentsGeneratedModel');
const puppeteer = require('puppeteer');
const pool = require('../config/database');
const archiver = require('archiver');

const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

/* ------------------- tiny utils ------------------- */
const { PDFDocument } = require('pdf-lib'); // used in downloadFinalPdf

const isHttpLike = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }
function atomicWrite(filePath, buf) {
  const dir = path.dirname(filePath);
  // make sure dir exists
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
  );
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath); // same FS rename; will throw on permission/SELinux issues
}

function interpolate(html, vars = {}) {
  return String(html).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), vars);
    return (val ?? '').toString();
  });
}
const trimOrNull = (v) => (v == null ? null : String(v).trim() || null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchByIds(table, ids, columns = '*') {
  if (!ids.length) return [];
  const chunks = chunk(uniq(ids), 1000);
  const results = [];
  for (const c of chunks) {
    const placeholders = c.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT ${columns} FROM \`${table}\` WHERE id IN (${placeholders})`,
      c
    );
    results.push(...rows);
  }
  return results;
}

/* ------------------- print shell helpers ------------------- */
const hasShell = (html = '') =>
  /class\s*=\s*["'][^"']*\bmain-page\b[^"']*["']/.test(html) &&
  /class\s*=\s*["'][^"']*\bsub-page\b[^"']*["']/.test(html);

const MIN_A4_CSS = `
  @page { size: A4; margin: 0; }
  html, body { width:210mm; height:297mm; margin:0; padding:0; background:#fff !important; }
  * { box-sizing:border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #printDialog{ display:flex; justify-content:center; align-items:flex-start; width:210mm; min-height:297mm; margin:0 auto; background:#fff !important; }
  body > *:not(#printDialog) { display:none !important; }
  .main-page{ width:210mm; min-height:297mm; background:#fff !important; box-shadow:none !important; overflow:hidden; }
  .sub-page{ margin:0; padding:20mm 25mm; }
  @media print { html, body { width:210mm; height:297mm; } .main-page { page-break-after:always; } }
`;
const MIN_LEGAL_CSS = `
  @page { size: Legal; margin: 0; }
  html, body { width:216mm; height:356mm; margin:0; padding:0; background:#fff !important; }
  * { box-sizing:border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  #printDialog{ display:flex; justify-content:center; align-items:flex-start; width:216mm; min-height:356mm; margin:0 auto; background:#fff !important; }
  body > *:not(#printDialog) { display:none !important; }
  .main-page{ width:216mm; min-height:356mm; background:#fff !important; box-shadow:none !important; }
  .sub-page{ margin:0; padding:20mm 25mm; }
  @media print { html, body { width:216mm; height:356mm; } .main-page { page-break-after:always; } }
`;

const wrapInA4 = (inner = '') =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="color-scheme" content="light" />
    <title>Document</title><style>${MIN_A4_CSS}</style>
  </head><body>
    <div id="printDialog"><div class="main-page"><div class="sub-page">${inner}</div></div></div>
  </body></html>`;

const wrapInLegal = (inner = '') =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="color-scheme" content="light" />
    <title>Document</title><style>${MIN_LEGAL_CSS}</style>
  </head><body>
    <div id="printDialog"><div class="main-page"><div class="sub-page">${inner}</div></div></div>
  </body></html>`;

function applyPageShell(html = '', page = 'A4') {
  if (hasShell(html)) return html;
  return String(page).toLowerCase() === 'legal' ? wrapInLegal(html) : wrapInA4(html);
}

const slugify = (s = '') =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'document';

/* ------------------- puppeteer/pdf ------------------- */
async function renderPdfBuffer(finalHtml, pdfOptions = {}) {
  let browser;
  try {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--force-color-profile=srgb',
          '--disable-low-end-device-mode',
          '--font-render-hinting=medium',
        ],
      });
    } catch {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--force-color-profile=srgb',
          '--disable-low-end-device-mode',
          '--font-render-hinting=medium',
        ],
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024, deviceScaleFactor: 2 });
    await page.emulateMediaType('screen');
    page.setDefaultNavigationTimeout(90000);
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

    // wait images
    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(
        imgs.map(async (img) => {
          if ('decode' in img) {
            try { await img.decode(); return; } catch {}
          }
          if (img.complete && img.naturalWidth) return;
          await new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          });
        })
      );
    });

    // wait fonts
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    });
    try {
      await page.waitForFunction(
        () => typeof document !== 'undefined' && document.fonts && document.fonts.status === 'loaded',
        { timeout: 10000 }
      );
    } catch {}

    await page.addStyleTag({
      content: `
        body { background:#fff !important; }
        #printDialog { background:#fff !important; }
        .main-page { background:#fff !important; box-shadow:none !important; margin:0 !important; }
      `,
    });

    await new Promise((r) => setTimeout(r, 50));

    const buf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      ...pdfOptions,
    });

    const size = Buffer.isBuffer(buf) ? buf.length : (buf?.byteLength ?? 0);
    if (!size || size < 1000) throw new Error('Empty/invalid PDF buffer generated');
    return buf;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

/* ------------------- session + audit helpers ------------------- */
// fetch latest esign row for a document
async function getLatestEsignSession(documentId) {
  const [rows] = await pool.query(
    `SELECT *
       FROM document_esign_sessions
      WHERE document_id=?
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT 1`,
    [documentId]
  );
  return rows?.[0] || null;
}

function safeParseVariables(v) {
  if (!v) return {};
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return v;
}

// Hides OTP codes; shows only timestamps + statuses
function buildAuditHtml({ doc, vars, session }) {
  const esc = (v) => String(v ?? '-')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const row = (label, value) =>
    `<tr><td style="width:240px;padding:4px 0">${esc(label)}</td><td style="padding:4px 0"><b>${esc(value)}</b></td></tr>`;

  const buyerContactLabel  = `Contact Verified (${vars?.buyer_contact_channel || '-'})`;
  const sellerContactLabel = `Contact Verified (${vars?.seller_contact_channel || '-'})`;

  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:12px;line-height:1.45">
    <h2 style="margin:0 0 8px">Verification & e-Sign Audit</h2>
    <div style="font-size:11px;color:#444;margin-bottom:12px">
      Document: <b>${esc(doc?.name || `#${doc?.id}`)}</b><br/>
      Document ID: <b>${esc(doc?.id)}</b><br/>
      Generated At: <b>${esc(new Date().toLocaleString('en-IN'))}</b>
    </div>

    <table style="width:100%;border-collapse:collapse">
      <tbody>
        <tr><td colspan="2" style="padding:8px 0 4px;font-weight:700">Buyer</td></tr>
        ${row(buyerContactLabel, vars?.buyer_contact_verified_at)}
        ${row('e-Sign (Aadhaar) OTP Verified At', vars?.buyer_e_sign_verified_at)}
        ${row('e-Sign Status', vars?.buyer_e_sign)}
  

        <tr><td colspan="2" style="padding:10px 0 4px;font-weight:700">Seller</td></tr>
        ${row(sellerContactLabel, vars?.seller_contact_verified_at)}
        ${row('e-Sign (Aadhaar) OTP Verified At', vars?.seller_e_sign_verified_at)}
        ${row('e-Sign Status', vars?.seller_e_sign)}

        <tr><td colspan="2" style="padding:10px 0 4px;font-weight:700">Session (latest)</td></tr>
        ${row('Session ID', session?.session_id || '-')}
        ${row('Provider', session?.provider || 'sandbox')}
        ${row('Provider Status', session?.status || '-')}
        ${row('Provider Signed At', session?.signed_at
              ? new Date(session.signed_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })
              : '-')}
      </tbody>
    </table>
  </div>`;
}


/* ------------------- VARS (timestamps only; NO OTPs, backend-only) ------------------- */

async function loadEsignVars(documentId, poolConn) {
  const OUT = {
    // Old fields (backward compatible)
    buyer_sms_verified_at: '-',
    buyer_email_verified_at: '-',
    buyer_e_sign_verified_at: '-',
    buyer_e_sign: 'pending',
    buyer_signed_at: '-',
    seller_sms_verified_at: '-',
    seller_email_verified_at: '-',
    seller_e_sign_verified_at: '-',
    seller_e_sign: 'pending',
    seller_signed_at: '-',

    // New “pick-one” fields
    buyer_contact_verified_at: '-',
    buyer_contact_channel: '-',
    seller_contact_verified_at: '-',
    seller_contact_channel: '-',
  };
  if (!documentId) return OUT;

  const fmt = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return isNaN(d.getTime())
      ? '-'
      : d.toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        });
  };

  // 1) sessions -> verified_at by role+channel
  const [otpRows] = await poolConn.query(
    `SELECT LOWER(role) AS role, LOWER(channel) AS channel, MAX(verified_at) AS verified_at
       FROM document_otp_sessions
      WHERE document_id = ?
      GROUP BY role, channel`,
    [documentId]
  );
  const otpMap = new Map();
  for (const r of otpRows || []) {
    if (r.role && r.channel) otpMap.set(`${r.role}_${r.channel}`, r.verified_at);
  }

  // 2) fallback events
  const [eventRows] = await poolConn.query(
    `SELECT
        CASE WHEN purpose LIKE 'buyer_%' THEN 'buyer'
             WHEN purpose LIKE 'seller_%' THEN 'seller' ELSE NULL END AS role,
        LOWER(COALESCE(
          JSON_UNQUOTE(JSON_EXTRACT(details, '$.channel')),
          JSON_UNQUOTE(JSON_EXTRACT(details, '$.Channel')),
          'email'
        )) AS channel,
        MAX(created_at) AS verified_at
     FROM document_otp_events
     WHERE document_id = ? AND status='verified'
     GROUP BY role, channel`,
    [documentId]
  );
  for (const r of eventRows || []) {
    if (!r.role || !r.channel) continue;
    const key = `${r.role}_${r.channel}`;
    if (!otpMap.get(key)) otpMap.set(key, r.verified_at);
  }

  // 3) eSign per role
  const [esignRows] = await poolConn.query(
    `SELECT LOWER(party_role) AS role,
            MAX(aadhaar_otp_verified_at) AS e_verified_at,
            MAX(signed_at) AS signed_at,
            SUBSTRING_INDEX(
              GROUP_CONCAT(status ORDER BY COALESCE(updated_at, created_at) DESC, id DESC),
              ',', 1
            ) AS status
       FROM document_esign_sessions
      WHERE document_id = ?
      GROUP BY role`,
    [documentId]
  );
  const esignByRole = new Map((esignRows || []).map(r => [r.role, r]));

  // Helper: choose one channel (latest wins if both)
  const pickOne = (emailTs, smsTs) => {
    if (emailTs && smsTs) {
      return new Date(emailTs) >= new Date(smsTs)
        ? { ch: 'Email', ts: emailTs }
        : { ch: 'SMS',   ts: smsTs  };
    }
    if (emailTs) return { ch: 'Email', ts: emailTs };
    if (smsTs)   return { ch: 'SMS',   ts: smsTs   };
    return { ch: '-', ts: null };
  };

  // BUYER (email/sms)
  const bEmail = otpMap.get('buyer_email') || null;
  const bSms   = otpMap.get('buyer_sms')   || null;
  OUT.buyer_email_verified_at  = fmt(bEmail);
  OUT.buyer_sms_verified_at    = fmt(bSms);
  const bPick = pickOne(bEmail, bSms);
  OUT.buyer_contact_channel     = bPick.ch;
  OUT.buyer_contact_verified_at = fmt(bPick.ts);

  // SELLER (email/sms)
  const sEmail = otpMap.get('seller_email') || null;
  const sSms   = otpMap.get('seller_sms')   || null;
  OUT.seller_email_verified_at  = fmt(sEmail);
  OUT.seller_sms_verified_at    = fmt(sSms);
  const sPick = pickOne(sEmail, sSms);
  OUT.seller_contact_channel     = sPick.ch;
  OUT.seller_contact_verified_at = fmt(sPick.ts);

  // eSign fields
  const b = esignByRole.get('buyer') || {};
  OUT.buyer_e_sign_verified_at = fmt(b.e_verified_at);
  OUT.buyer_signed_at          = fmt(b.signed_at);
  OUT.buyer_e_sign             = b.status || 'pending';

  const s = esignByRole.get('seller') || {};
  OUT.seller_e_sign_verified_at = fmt(s.e_verified_at);
  OUT.seller_signed_at          = fmt(s.signed_at);
  OUT.seller_e_sign             = s.status || 'pending';

  return OUT;
}



/* ------------------- more helpers ------------------- */
const {toPublicUrl,      makeUploadTarget, } = require('../middleware/upload');

function getActorIds(req, body = {}) {
  const authId = req.user?.id ?? req.user?.user_id;
  const bodyCreated = body.created_by;
  const bodyUpdated = body.updated_by;

  const creatorId = (authId != null ? Number(authId) : Number(bodyCreated)) || null;
  const updaterId = (authId != null ? Number(authId) : Number(bodyUpdated) || Number(bodyCreated)) || null;

  return { creatorId, updaterId };
}

// helper: sanitize + ensure .pdf
function makeSafePdfName(raw) {
  const base = String(raw || '')
    .trim()
    .replace(/\.[Pp][Dd][Ff]$/, '')
    .replace(/[^\p{L}\p{N}\-_.\s]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 150)
    .trim() || 'document';
  return `${base}.pdf`;
}

/* ------------------- merged vars for templates ------------------- */
async function buildVarsForDoc(row) {
  const base = safeParseVariables(row.variables); // may be {} if null/string
  const esignVars = await loadEsignVars(row.id, pool); // timestamps + status only

  // runtime stamps (print friendly)
  const now = new Date();
  const current_date = now.toLocaleDateString('en-IN');
  const current_datetime = now.toLocaleString('en-IN');

  return {
    ...base,
    ...esignVars,
    current_date,
    current_datetime,
    // sensible fallbacks
    document_id: base?.document_id ?? row?.id ?? '',
    document_date: base?.document_date ?? (now.toISOString().slice(0,10)),
    company_name: base?.company_name ?? base?.company?.name ?? '',
  };
}

/* ------------------- controller ------------------- */
const DocumentsGeneratedController = {
  /* CREATE */
  async create(req, res) {
    try {
      const {
        template_id = null,
        name,
        title,
        description = null,
        category = null,
        content,
        templateContent,
        variables,
        status = 'draft',
      } = req.body || {};

      const finalName = trimOrNull(name) || trimOrNull(title);
      if (!finalName) return res.status(400).json({ error: 'name is required' });

      let finalHtml = content;
      if (!finalHtml) {
        if (!templateContent)
          return res.status(400).json({ error: "Provide either 'content' or 'templateContent'." });
        if (!isObj(variables))
          return res.status(400).json({ error: "For interpolation, 'variables' must be an object map." });
        finalHtml = interpolate(templateContent, variables);
      }

      const { creatorId, updaterId } = getActorIds(req, req.body);
      const payload = {
        template_id,
        name: finalName,
        description,
        category: trimOrNull(category) || 'deal',
        content: finalHtml,
        variables: variables ?? null,
        status,
        created_by: creatorId,
        updated_by: updaterId,
      };

      const { id } = await Model.create(payload);
      const row = await Model.getById(id);
      return res.status(201).json({ data: row });
    } catch (e) {
      console.error('documents-generated:create', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* GET ALL */
  async getAll(req, res) {
    try {
      const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
      const created_by = req.query.created_by ? Number(req.query.created_by) : null;
      const rows = await Model.getAll({ includeDeleted, created_by });
      return res.json({ data: rows });
    } catch (err) {
      console.error('documents-generated:getAll', err);
      return res.status(500).json({ error: err?.message || 'Internal error' });
    }
  },

  /* GET ONE */
  async getOne(req, res) {
    try {
      const id = Number(req.params.id);
      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json({ data: row });
    } catch (e) {
      console.error('documents-generated:getOne', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* UPDATE */
  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const body = req.body || {};
      const patch = { ...body };

      if (!patch.content && patch.templateContent && patch.variables) {
        patch.content = interpolate(patch.templateContent, patch.variables);
      }

      const authId = req.user?.id ?? req.user?.user_id;
      patch.updated_by = (authId != null ? Number(authId) : Number(body.updated_by)) || null;

      const { affectedRows } = await Model.update(id, patch);
      if (!affectedRows) return res.status(404).json({ error: 'Not found or no changes' });

      const row = await Model.getById(id);
      return res.json({ data: row });
    } catch (e) {
      console.error('documents-generated:update', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* SOFT DELETE */
  async softDelete(req, res) {
    try {
      const id = Number(req.params.id);
      const { affectedRows } = await Model.softDelete(id, req.user?.id || null);
      if (!affectedRows) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    } catch (e) {
      console.error('documents-generated:softDelete', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* RESTORE */
  async restore(req, res) {
    try {
      const id = Number(req.params.id);
      const { affectedRows } = await Model.restore(id, req.user?.id || null);
      if (!affectedRows) return res.status(404).json({ error: 'Not found' });
      const row = await Model.getById(id);
      return res.json({ data: row });
    } catch (e) {
      console.error('documents-generated:restore', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* HARD DELETE */
  async hardDelete(req, res) {
    try {
      const id = Number(req.params.id);
      const { affectedRows } = await Model.hardDelete(id);
      if (!affectedRows) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    } catch (e) {
      console.error('documents-generated:hardDelete', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* INLINE PDF */
  async pdf(req, res) {
    try {
      const id = Number(req.params.id);
      const pageType = (req.query.page || 'A4').toString();
      const dispositionQ = (req.query.disposition || 'attachment').toString().toLowerCase();

      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });

      const vars = await buildVarsForDoc(row); // backend-only vars
      const filled = interpolate(row.content || '', vars);
      const html = applyPageShell(filled, pageType);

      const pdfBuffer = await renderPdfBuffer(html);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? 0);
      if (!size || size < 1000) return res.status(500).json({ error: 'Failed to generate valid PDF' });

      const out = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
      const fname = `${slugify(row.name || 'document')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${dispositionQ === 'inline' ? 'inline' : 'attachment'}; filename="${fname}"`
      );
      return res.send(out);
    } catch (e) {
      console.error('documents-generated:pdf', e);
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
  },

  /* DOWNLOAD PDF */
  async downloadPdf(req, res) {
    try {
      const id = Number(req.params.id);
      const pageParam = String(req.query.page || '').toLowerCase();
      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });

      const desired = pageParam === 'legal' ? 'Legal' : 'A4';

      const vars = await buildVarsForDoc(row);
      const filled = interpolate(row.content || '', vars);
      const html = applyPageShell(filled, desired);

      const pdfBuffer = await renderPdfBuffer(html);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? 0);
      if (!size || size < 1000) return res.status(500).json({ error: 'Failed to generate valid PDF' });

      const out = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
      const fname = `${slugify(row.name || 'document')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.send(out);
    } catch (e) {
      console.error('documents-generated:downloadPdf', e);
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
  },

  /* On-the-fly PDF (unsaved) */
  async pdfFromHtml(req, res) {
    try {
      const {
        html,
        templateContent,
        variables = {},
        page = 'A4',
        disposition = 'attachment',
        name = 'document',
      } = req.body || {};

      let inner = html;
      if (!inner) {
        if (!templateContent) return res.status(400).json({ error: 'Provide html OR (templateContent + variables).' });
        inner = interpolate(templateContent, variables);
      }

      const wrapped = applyPageShell(inner, page);
      const pdfBuffer = await renderPdfBuffer(wrapped);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? 0);
      if (!size || size < 1000) return res.status(500).json({ error: 'Failed to generate PDF' });

      const fname = `${slugify(name)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${String(disposition).toLowerCase() === 'inline' ? 'inline' : 'attachment'}; filename="${fname}"`
      );
      return res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));
    } catch (e) {
      console.error('documents-generated:pdfFromHtml', e);
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
  },

  async savePdfToStorage(req, res) {
    // TOP of savePdfToStorage (after id/page parsing)
// console.log('[savePdfToStorage] ENV', {
//   UPLOAD_ROOT: process.env.UPLOAD_ROOT,
//   UPLOAD_PUBLIC_BASE: process.env.UPLOAD_PUBLIC_BASE,
//   cwd: process.cwd(),
//   node_user: (process.getuid && process.getuid()) || 'win/no-getuid'
// });

    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'invalid document id' });

      const pageParam = String(req.query.page || req.body?.page || 'A4');
      const esignSessionId = req.body?.esign_session_id || req.query.esign_session_id || null;

      // 1) fetch document
      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ ok: false, error: 'document not found' });

      // 2) filename
      const overrideNameRaw = req.body?.output_name || req.query?.output_name || '';
      const wantedName = overrideNameRaw ? overrideNameRaw : (row.name || row.title || `document-${id}`);
      const safeName = makeSafePdfName(wantedName);

      // 3) wrap & render
      const desired = pageParam.toLowerCase() === 'legal' ? 'Legal' : 'A4';

      const vars = await buildVarsForDoc(row);
      const filled = interpolate(row.content || '', vars);
      const html = applyPageShell(filled, desired);

      const pdfBuffer = await renderPdfBuffer(html);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? 0);
      if (!size || size < 1000) return res.status(500).json({ ok: false, error: 'invalid pdf generated' });

      // 4) target
   const { absPath, publicUrl } = makeUploadTarget('documents', String(id), safeName);
   
// --- add these lines right after makeUploadTarget:
const dirPath = path.dirname(absPath);
const normalizedAbs = absPath.replace(/\\/g, '/');
console.log('[savePdfToStorage] target', { dirPath, absPath: normalizedAbs });

try {
  fs.accessSync(dirPath, fs.constants.W_OK);
  console.log('[savePdfToStorage] dir is writable');
} catch (e) {
  console.error('[savePdfToStorage] dir NOT writable:', e.message);
  return res.status(500).json({ ok:false, error:'dir_not_writable', details: e.message, dirPath });
}

      // 5) write + hash
      const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
      const hash = sha256(buf);
      ensureDir(path.dirname(absPath));
      atomicWrite(absPath, buf);

      // 6) urls
      const file_url = publicUrl;
      const file_url_http = isHttpLike(file_url)
        ? file_url
        : `${req.protocol}://${req.get('host')}${file_url}`;

      // 7) persist on the document row
      let persisted = true;
      try {
        const authId = req.user?.id ?? req.user?.user_id ?? null;
        await pool.execute(
          `UPDATE documents_generated
             SET pdf_path              = ?,
                 pdf_url               = ?,
                 pdf_hash              = ?,
                 last_pdf_generated_at = CURRENT_TIMESTAMP,
                 updated_by            = ?,
                 updated_at            = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [absPath, file_url, hash, authId, id]
        );
      } catch (e) {
        persisted = false;
        console.error('documents_generated update failed:', e);
      }

      // 8) tie to e-sign session if provided
      let updatedEsign = false;
      if (esignSessionId) {
        try {
          await pool.execute(
            `UPDATE document_esign_sessions
               SET original_pdf_path = ?,
                   original_pdf_name = ?,
                   original_sha256   = ?,
                   status            = COALESCE(status, 'pdf_saved'),
                   updated_at        = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [absPath, safeName, hash, esignSessionId]
          );
          updatedEsign = true;
        } catch (e) {
          console.error('esign session update failed:', e);
        }
      }

      // 9) respond
      return res.json({
        ok: true,
        status: 'pdf_saved',
        document_id: id,
        file_path: absPath,
        file_url,
        file_url_http,
        file_name: safeName,
        sha256: hash,
        persisted,
        updated_esign_session: updatedEsign,
      });
    } catch (e) {
      console.error('documents-generated:savePdfToStorage', e);
      return res.status(500).json({ ok: false, error: 'Failed to save PDF' });
    }
  },

  /* GET ONE with relations */
  async getOneWithRelations(req, res) {
    try {
      const id = Number(req.params.id);
      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Document not found' });

      const variables = row.variables && typeof row.variables === 'string'
        ? JSON.parse(row.variables)
        : row.variables || {};

      const buyerId = variables.buyer?.id ?? null;
      const sellerId = variables.seller?.id ?? null;
      const executiveId = variables.executive_id ?? null;
      const propertyIds = variables.properties?.map(p => p.id) || (variables.property ? [variables.property.id] : []);

      const fetchEntity = async (table, id) =>
        id ? (await pool.query('SELECT * FROM ?? WHERE id = ?', [table, id]))[0][0] : null;
      const fetchProperties = async (ids) =>
        ids.length ? (await pool.query('SELECT * FROM properties WHERE id IN (?)', [ids]))[0] : [];
      const fetchTemplate = async (templateId) =>
        templateId
          ? (await pool.query('SELECT id, name, category, description FROM documents_templates WHERE id = ?', [templateId]))[0][0]
          : null;

      const [buyer, seller, executive, properties, template] = await Promise.all([
        fetchEntity('buyers', buyerId),
        fetchEntity('sellers', sellerId),
        fetchEntity('users', executiveId),
        fetchProperties(propertyIds),
        fetchTemplate(row.template_id),
      ]);

      const fullDocument = {
        ...row,
        template_name: template?.name || null,
        template_category: template?.category || null,
        template_description: template?.description || null,
        variables: {
          ...variables,
          buyer,
          seller,
          executive,
          properties,
        },
      };

      return res.json({ data: fullDocument });
    } catch (err) {
      console.error('documents-generated:getOneWithRelations', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* GET ALL with relations (batched) */
  async getAllWithRelations(req, res) {
    try {
      const rows = await Model.getAll();
      if (!rows || !rows.length) return res.json({ data: [] });

      const buyers = [];
      const sellers = [];
      const executives = [];
      const templates = [];
      const propertyIdBuckets = [];

      const parsed = rows.map((row) => {
        const v = safeParseVariables(row.variables);

        const buyerId = v?.buyer?.id || null;
        const sellerId = v?.seller?.id || null;
        const executiveId = v?.executive_id || v?.executive?.id || null;

        let propertyIds = [];
        if (Array.isArray(v?.properties)) {
          propertyIds = v.properties.map(p => p?.id).filter(Boolean);
        } else if (v?.property?.id) {
          propertyIds = [v.property.id];
        }

        buyers.push(buyerId);
        sellers.push(sellerId);
        executives.push(executiveId);
        templates.push(row.template_id);
        propertyIdBuckets.push(propertyIds);

        return { row, variables: v, buyerId, sellerId, executiveId, propertyIds };
      });

      const [buyerRows, sellerRows, execRows, templateRows] = await Promise.all([
        fetchByIds('buyers', buyers, '*'),
        fetchByIds('sellers', sellers, '*'),
        fetchByIds('users', executives, '*'),
        fetchByIds('documents_templates', templates, 'id, name, category, description'),
      ]);

      const allPropertyIds = uniq(propertyIdBuckets.flat());
      const propertyRows = await fetchByIds('properties', allPropertyIds, '*');

      const buyerById = new Map(buyerRows.map(b => [b.id, b]));
      const sellerById = new Map(sellerRows.map(s => [s.id, s]));
      const execById  = new Map(execRows.map(u => [u.id, u]));
      const tmplById  = new Map(templateRows.map(t => [t.id, t]));
      const propertyById = new Map(propertyRows.map(p => [p.id, p]));

      const results = parsed.map(({ row, variables, buyerId, sellerId, executiveId, propertyIds }) => {
        const template = tmplById.get(row.template_id) || null;
        const stitchedProps = (propertyIds || []).map(id => propertyById.get(id)).filter(Boolean);

        return {
          ...row,
          template_name: template?.name || null,
          template_category: template?.category || null,
          template_description: template?.description || null,
          variables: {
            ...variables,
            buyer: buyerId ? (buyerById.get(buyerId) || null) : null,
            seller: sellerId ? (sellerById.get(sellerId) || null) : null,
            executive: executiveId ? (execById.get(executiveId) || null) : null,
            properties: stitchedProps,
          },
        };
      });

      return res.json({ data: results });
    } catch (err) {
      console.error('documents-generated:getAllWithRelations', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  /* BULK: stream ZIP of PDFs */
  async bulkDownloadZip(req, res) {
    try {
      const { ids = [], options = {} } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids[] required' });
      }

      const pageOpt = (options.page || 'A4').toString();
      const filenamePrefix = (options.filenamePrefix || 'documents').toString();

      const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); // YYYYMMDDHHmm
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${slugify(filenamePrefix)}_${ids.length}_files_${stamp}.zip"`
      );

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        try { res.status(500).end(String(err?.message || err)); } catch {}
      });
      archive.pipe(res);

      for (const rawId of ids) {
        const id = Number(rawId);
        try {
          const row = await Model.getById(id);
          if (!row) {
            archive.append(Buffer.from(`Document ${id} not found`), { name: `ERROR_${id}.txt` });
            continue;
          }

          const vars = await buildVarsForDoc(row);
          const filled = interpolate(row.content || '', vars);
          const html = applyPageShell(filled, pageOpt);

          const pdfBuffer = await renderPdfBuffer(html);

          const fname = `${slugify(row.name || 'document')}_${id}.pdf`;
          archive.append(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer), { name: fname });
        } catch (e) {
          archive.append(
            Buffer.from(`Failed to generate PDF for document ${id}\n${String((e && e.message) || e)}`),
            { name: `ERROR_${id}.txt` }
          );
        }
      }

      await archive.finalize();
    } catch (e) {
      console.error('documents-generated:bulkDownloadZip', e);
      try {
        return res.status(500).json({ error: e?.message || 'Bulk download failed' });
      } catch {}
    }
  },

  /* FINAL PDF (prefer signed, append 1-page audit with VERIFIED TIMESTAMPS) */
  async downloadFinalPdf(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'invalid id' });

      // 1) fetch base doc + latest esign session
      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });

      const session = await getLatestEsignSession(id);

      // 2) vars (ONLY timestamps/status; NO OTP codes)
      const base = safeParseVariables(row.variables);
      const esignVars = await loadEsignVars(row.id, pool);
      const now = new Date();
      const vars = {
        ...base,
        ...esignVars,
        current_date: now.toLocaleDateString('en-IN'),
        current_datetime: now.toLocaleString('en-IN'),
        document_id: base?.document_id ?? row?.id ?? '',
        document_date: base?.document_date ?? (now.toISOString().slice(0,10)),
        company_name: base?.company_name ?? base?.company?.name ?? '',
      };

      // 3) build 1-page AUDIT PDF
      const auditHtmlInner = buildAuditHtml({ doc: row, vars, session });
      const auditWrapped = applyPageShell(auditHtmlInner, 'A4');
      const auditPdf = await renderPdfBuffer(auditWrapped);

      // 4) base PDF: prefer signed PDF if exists, else render from HTML
      let basePdfBuffer;
      if (session?.signed_pdf_path && fs.existsSync(session.signed_pdf_path)) {
        basePdfBuffer = fs.readFileSync(session.signed_pdf_path);
      } else {
        const filled = interpolate(row.content || '', vars);
        const html = applyPageShell(filled, 'A4');
        basePdfBuffer = await renderPdfBuffer(html);
      }

      // 5) merge: base pages + audit last page
      const baseDoc = await PDFDocument.load(Buffer.isBuffer(basePdfBuffer) ? basePdfBuffer : Buffer.from(basePdfBuffer));
      const auditDoc = await PDFDocument.load(Buffer.isBuffer(auditPdf) ? auditPdf : Buffer.from(auditPdf));

      const merged = await PDFDocument.create();
      const basePages = await merged.copyPages(baseDoc, baseDoc.getPageIndices());
      basePages.forEach(p => merged.addPage(p));
      const [auditPage] = await merged.copyPages(auditDoc, [0]);
      merged.addPage(auditPage);

      const finalBuf = await merged.save();

      // 6) send
      const fname = `${slugify(row.name || 'document')}_final.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.send(Buffer.from(finalBuf));
    } catch (e) {
      console.error('documents-generated:downloadFinalPdf', e);
      return res.status(500).json({ error: 'Failed to prepare final PDF' });
    }
  },

  /* BACKEND-ONLY SUMMARY (no frontend input) */
  async verificationSummary(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ ok:false, error:'invalid id' });

      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ ok:false, error:'Document not found' });

      const vars = await loadEsignVars(id, pool);
      const latest = await getLatestEsignSession(id);

      return res.json({
        ok: true,
        document_id: id,
        buyer: {
          sms_verified_at:   vars.buyer_sms_verified_at,
          email_verified_at: vars.buyer_email_verified_at,
          esign_verified_at: vars.buyer_e_sign_verified_at,
          esign_status:      vars.buyer_e_sign,
          signed_at:         vars.buyer_signed_at,
        },
        seller: {
          sms_verified_at:   vars.seller_sms_verified_at,
          email_verified_at: vars.seller_email_verified_at,
          esign_verified_at: vars.seller_e_sign_verified_at,
          esign_status:      vars.seller_e_sign,
          signed_at:         vars.seller_signed_at,
        },
        session: latest ? {
          session_id: latest.session_id,
          provider: latest.provider,
          status: latest.status,
          signed_at: latest.signed_at,
        } : null
      });
    } catch (e) {
      console.error('documents-generated:verificationSummary', e);
      return res.status(500).json({ ok:false, error:'Failed to load verification summary' });
    }
  },
};

module.exports = DocumentsGeneratedController;
