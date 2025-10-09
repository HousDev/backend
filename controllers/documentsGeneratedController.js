// controllers/documentsGeneratedController.js
const Model = require('../models/documentsGeneratedModel');
const puppeteer = require('puppeteer');
const pool=require("../config/database")
const archiver = require('archiver'); // 👈 ADD THIS
/* ------------------- helpers ------------------- */
function interpolate(html, vars = {}) {
  return String(html).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), vars);
    return (val ?? '').toString();
  });
}
const trimOrNull = (v) => (v == null ? null : String(v).trim() || null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Detect if template already provides print shell */
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

async function renderPdfBuffer(finalHtml, pdfOptions = {}) {
  let browser;
  try {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox','--disable-setuid-sandbox','--force-color-profile=srgb','--disable-low-end-device-mode','--font-render-hinting=medium'],
      });
    } catch {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox','--disable-setuid-sandbox','--force-color-profile=srgb','--disable-low-end-device-mode','--font-render-hinting=medium'],
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024, deviceScaleFactor: 2 });
    await page.emulateMediaType('screen');
    page.setDefaultNavigationTimeout(90000);
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

    await page.evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(imgs.map(async (img) => {
        if ('decode' in img) { try { await img.decode(); return; } catch {} }
        if (img.complete && img.naturalWidth) return;
        await new Promise((res) => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        });
      }));
    });

    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
    });
    try {
      await page.waitForFunction(() => typeof document !== 'undefined' &&
        document.fonts && document.fonts.status === 'loaded', { timeout: 10000 });
    } catch {}

    await page.addStyleTag({ content: `
      body { background:#fff !important; }
      #printDialog { background:#fff !important; }
      .main-page { background:#fff !important; box-shadow:none !important; margin:0 !important; }
    `});

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

/* ------------------- audit helper ------------------- */
function getActorIds(req, body = {}) {
  const authId = req.user?.id ?? req.user?.user_id;
  const bodyCreated = body.created_by;
  const bodyUpdated = body.updated_by;

  const creatorId = (authId != null ? Number(authId) : Number(bodyCreated)) || null;
  const updaterId = (authId != null ? Number(authId) : Number(bodyUpdated) || Number(bodyCreated)) || null;

  return { creatorId, updaterId };
}

/* ------------------- controller ------------------- */
const DocumentsGeneratedController = {
  /* CREATE (fixed) */
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

      // validate name
      const finalName = trimOrNull(name) || trimOrNull(title);
      if (!finalName) return res.status(400).json({ error: 'name is required' });

      // build HTML
      let finalHtml = content;
      if (!finalHtml) {
        if (!templateContent)
          return res.status(400).json({ error: "Provide either 'content' or 'templateContent'." });
        if (!isObj(variables))
          return res.status(400).json({ error: "For interpolation, 'variables' must be an object map." });
        finalHtml = interpolate(templateContent, variables);
      }

      // audit ids (auth → body fallback)
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
        updated_by: updaterId, // always set
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

  /* UPDATE (fixed) */
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

      let html = row.content || '';
      html = applyPageShell(html, pageType);

      const pdfBuffer = await renderPdfBuffer(html);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? 0);
      if (!size || size < 1000) return res.status(500).json({ error: 'Failed to generate valid PDF' });

      const out = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
      const fname = `${slugify(row.name || 'document')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${dispositionQ === 'inline' ? 'inline' : 'attachment'}; filename="${fname}"`);
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

      let html = row.content || '';
      const desired = pageParam === 'legal' ? 'Legal' : 'A4';
      html = applyPageShell(html, desired);

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
      const { html, templateContent, variables = {}, page = 'A4', disposition = 'attachment', name = 'document' } = req.body || {};
      let inner = html;
      if (!inner) {
        if (!templateContent) return res.status(400).json({ error: 'Provide html OR (templateContent + variables).' });
        inner = interpolate(templateContent, variables);
      }
      const wrapped = applyPageShell(inner, page);
      const pdfBuffer = await renderPdfBuffer(wrapped);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? 0);
      if (!size || size < 1000) return res.status(500).json({ error: 'Failed to generate valid PDF' });

      const fname = `${slugify(name)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${String(disposition).toLowerCase() === 'inline' ? 'inline' : 'attachment'}; filename="${fname}"`);
      return res.send(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer));
    } catch (e) {
      console.error('documents-generated:pdfFromHtml', e);
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
  },
  
  
  
};
DocumentsGeneratedController.getOneWithRelations = async (req, res) => {
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

    const fetchEntity = async (table, id) => id ? (await pool.query(`SELECT * FROM ?? WHERE id = ?`, [table, id]))[0][0] : null;
    const fetchProperties = async (ids) => ids.length ? (await pool.query(`SELECT * FROM properties WHERE id IN (?)`, [ids]))[0] : [];
    const fetchTemplate = async (templateId) => templateId ? (await pool.query(`SELECT id, name, category, description FROM documents_templates WHERE id = ?`, [templateId]))[0][0] : null;

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
};

DocumentsGeneratedController.getAllWithRelations = async (req, res) => {
  try {
    const rows = await Model.getAll();
    if (!rows || !rows.length) return res.json({ data: [] });

    const parseVariables = (v) => {
      if (!v) return {};
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return {}; }
      }
      return v;
    };

    const fetchEntity = async (table, id) =>
      id ? (await pool.query(`SELECT * FROM ?? WHERE id = ?`, [table, id]))[0][0] || null : null;

    const fetchProperties = async (ids) =>
      ids && ids.length ? (await pool.query(`SELECT * FROM properties WHERE id IN (?)`, [ids]))[0] || [] : [];

    const fetchTemplate = async (templateId) =>
      templateId ? (await pool.query(`SELECT id, name, category, description FROM documents_templates WHERE id = ?`, [templateId]))[0][0] : null;

    const results = await Promise.all(rows.map(async (row) => {
      const variables = parseVariables(row.variables);

      const buyerId = variables.buyer?.id || null;
      const sellerId = variables.seller?.id || null;
      const executiveId = variables.executive_id || null;

      let propertyIds = [];
      if (Array.isArray(variables.properties)) {
        propertyIds = variables.properties.map(p => p.id).filter(Boolean);
      } else if (variables.property?.id) {
        propertyIds = [variables.property.id];
      }

      const [buyer, seller, executive, properties, template] = await Promise.all([
        fetchEntity('buyers', buyerId),
        fetchEntity('sellers', sellerId),
        fetchEntity('users', executiveId),
        fetchProperties(propertyIds),
        fetchTemplate(row.template_id),
      ]);

      return {
        ...row,
        template_name: template?.name || null,
        template_category: template?.category || null,
        template_description: template?.description || null,
        variables: {
          ...variables,
          buyer: buyer || null,
          seller: seller || null,
          executive: executive || null,
          properties: properties || [],
        },
      };
    }));

    return res.json({ data: results });
  } catch (err) {
    console.error('documents-generated:getAllWithRelations', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};



async function bulkDownloadZip(req, res) {
  try {
    const { ids = [], options = {} } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids[] required" });
    }

    const pageOpt = (options.page || 'A4').toString();
    const filenamePrefix = (options.filenamePrefix || 'documents').toString();

    // ZIP response headers
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0,14); // YYYYMMDDHHmm
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${slugify(filenamePrefix)}_${ids.length}_files_${stamp}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      try { res.status(500).end(String(err?.message || err)); } catch {}
    });
    archive.pipe(res);

    // Process sequentially (safer for memory/CPU)
    for (const rawId of ids) {
      const id = Number(rawId);
      try {
        const row = await Model.getById(id);
        if (!row) {
          archive.append(Buffer.from(`Document ${id} not found`), { name: `ERROR_${id}.txt` });
          continue;
        }

        // build final HTML with shell
        const html = applyPageShell(row.content || '', pageOpt);

        // generate PDF buffer (reuses your single-PDF engine)
        const pdfBuffer = await renderPdfBuffer(html, { /* extra pdf options if needed */ });

        const fname = `${slugify(row.name || 'document')}_${id}.pdf`;
        archive.append(Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer), { name: fname });
      } catch (e) {
        archive.append(
          Buffer.from(`Failed to generate PDF for document ${id}\n${String(e && e.message || e)}`),
          { name: `ERROR_${id}.txt` }
        );
      }
    }

    await archive.finalize(); // stream end
  } catch (e) {
    console.error('documents-generated:bulkDownloadZip', e);
    try {
      return res.status(500).json({ error: e?.message || 'Bulk download failed' });
    } catch {}
  }
}

// export karo (jahan tum module.exports kar rahe ho, wahan add kar do)
DocumentsGeneratedController.bulkDownloadZip = bulkDownloadZip;


module.exports = DocumentsGeneratedController;
