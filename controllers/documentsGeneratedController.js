// controllers/documentsGeneratedController.js
const Model = require('../models/documentsGeneratedModel');
const puppeteer = require('puppeteer');

/* ------------------- helpers ------------------- */
function interpolate(html, vars = {}) {
  return String(html).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), vars);
    return (val ?? '').toString();
  });
}
const trimOrNull = (v) => (v == null ? null : String(v).trim() || null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Detect the presence of your intended print shell.
 * If BOTH .main-page and .sub-page exist, we won't inject any backend CSS.
 */
const hasShell = (html = '') =>
  /class\s*=\s*["'][^"']*\bmain-page\b[^"']*["']/.test(html) &&
  /class\s*=\s*["'][^"']*\bsub-page\b[^"']*["']/.test(html);

/* ---------- Minimal shells (ONLY when your HTML has no shell) ---------- */
/** 
 * NOTE: This is intentionally minimal. It sets physical size and zero margins,
 * but doesn't change your fonts/colors/layout. Your template CSS rules win.
 */
const MIN_A4_CSS = `
  @page { size: A4; margin: 0; }
  html, body {
    width: 210mm;
    height: 297mm;
    margin: 0;
    padding: 0;
    background: #ffffff !important; /* ✅ force white background */
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  #printDialog {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #ffffff !important;
  }
  /* ✅ Only print .main-page — rest hidden */
  body > *:not(#printDialog) { display: none !important; }
  .main-page {
    width: 210mm;
    min-height: 297mm;
    background: #fff !important;
    box-shadow: none !important;
    overflow: hidden;
  }
  .sub-page {
    margin: 0;
    padding: 20mm 25mm; /* same as your preview visual space */
  }
  @media print {
    html, body { width: 210mm; height: 297mm; }
    .main-page { page-break-after: always; }
  }
`;
const MIN_LEGAL_CSS = `
  @page { size: Legal; margin: 0; }
  html, body {
    width: 216mm;
    height: 356mm;
    margin: 0;
    padding: 0;
    background: #ffffff !important;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  #printDialog {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 216mm;
    min-height: 356mm;
    margin: 0 auto;
    background: #ffffff !important;
  }
  body > *:not(#printDialog) { display: none !important; }
  .main-page {
    width: 216mm;
    min-height: 356mm;
    background: #fff !important;
    box-shadow: none !important;
  }
  .sub-page { margin: 0; padding: 20mm 25mm; }
  @media print {
    html, body { width: 216mm; height: 356mm; }
    .main-page { page-break-after: always; }
  }
`;

const wrapInA4 = (inner = '') =>
  `<!doctype html><html><head><meta charset="utf-8"/>
    <meta name="color-scheme" content="light" />
    <title>Document</title>
    <style>${MIN_A4_CSS}</style>
  </head><body>
    <div id="printDialog"><div class="main-page"><div class="sub-page">${inner}</div></div></div>
  </body></html>`;

const wrapInLegal = (inner = '') =>
  `<!doctype html><html><head><meta charset="utf-8"/>
    <meta name="color-scheme" content="light" />
    <title>Document</title>
    <style>${MIN_LEGAL_CSS}</style>
  </head><body>
    <div id="printDialog"><div class="main-page"><div class="sub-page">${inner}</div></div></div>
  </body></html>`;

/**
 * Only apply shell when your template doesn't include it.
 * If shell exists, return HTML untouched (so your preview & PDF match).
 */
function applyPageShell(html = '', page = 'A4') {
  if (hasShell(html)) return html;
  return String(page).toLowerCase() === 'legal' ? wrapInLegal(html) : wrapInA4(html);
}

const slugify = (s = '') =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'document';

/* ---------- Puppeteer renderer (color-accurate, page-size exact) ---------- */
async function renderPdfBuffer(finalHtml, pdfOptions = {}) {
  let browser;
  try {
    // Launch (new syntax -> fallback for older Puppeteer)
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

    // High DPR for crisp text/images
    await page.setViewport({ width: 1280, height: 1024, deviceScaleFactor: 2 });

    // Match on-screen preview (ignore @media print)
    await page.emulateMediaType('screen');

    // Load content
    page.setDefaultNavigationTimeout(90000);
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

    // Wait for images to be fully decoded
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

    // Ensure webfonts are loaded (compatible with older Puppeteer)
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch {}
      }
    });
    // Extra guard: wait until fonts.status === 'loaded' (older Puppeteer accepts function)
    try {
      await page.waitForFunction(() => typeof document !== 'undefined' &&
        document.fonts && document.fonts.status === 'loaded', { timeout: 10000 });
    } catch { /* ignore timeout */ }

    // Enforce white background + exact color
   await page.addStyleTag({
     content: `
       body { background: #fff !important; }
       #printDialog { background: #fff !important; }
       .main-page { background: #fff !important; box-shadow: none !important; margin: 0 !important; }
     `
   });

    // Small settle delay (works on all versions)
    await new Promise((r) => setTimeout(r, 50));

    const buf = await page.pdf({
      printBackground: true,     // keep backgrounds/colors
      preferCSSPageSize: true,   // honor @page size from your HTML (A4/Legal)
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



/* ------------------- controller ------------------- */
const DocumentsGeneratedController = {
  // CREATE
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

      const created_by = req.user?.id || null;
      const { id } = await Model.create({
        template_id,
        name: finalName,
        description,
        category,
        content: finalHtml,
        variables: variables ?? null,
        status,
        created_by,
      });

      const row = await Model.getById(id);
      return res.status(201).json({ data: row });
    } catch (e) {
      console.error('documents-generated:create', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  // GET ALL
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

  // GET ONE
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

  // UPDATE
  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const patch = { ...req.body, updated_by: req.user?.id || null };

      if (!patch.content && patch.templateContent && patch.variables) {
        patch.content = interpolate(patch.templateContent, patch.variables);
      }

      const { affectedRows } = await Model.update(id, patch);
      if (!affectedRows) return res.status(404).json({ error: 'Not found or no changes' });

      const row = await Model.getById(id);
      return res.json({ data: row });
    } catch (e) {
      console.error('documents-generated:update', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },

  // DELETE METHODS
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

  /* ================== PDF (INLINE + DOWNLOAD) ================== */
  async pdf(req, res) {
    try {
      const id = Number(req.params.id);
      const pageType = (req.query.page || 'A4').toString(); // 'A4' | 'Legal'
      const dispositionQ = (req.query.disposition || 'attachment').toString().toLowerCase();

      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });

      // IMPORTANT: if template already includes shell, DO NOT touch HTML
      let html = row.content || '';
      html = applyPageShell(html, pageType);
      console.log('📄 HTML length:', html.length);

      const pdfBuffer = await renderPdfBuffer(html);
      const size = Buffer.isBuffer(pdfBuffer)
        ? pdfBuffer.length
        : (pdfBuffer?.byteLength ?? pdfBuffer?.length ?? 0);

      console.log('📦 PDF buffer size:', size);
      if (!size || size < 1000) {
        console.error('❌ Invalid or empty PDF buffer generated (size:', size, ')');
        return res.status(500).json({ error: 'Failed to generate valid PDF' });
      }

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

  /* ============== Backward compat DOWNLOAD endpoint ============== */
  async downloadPdf(req, res) {
    try {
      const id = Number(req.params.id);
      const pageParam = String(req.query.page || '').toLowerCase(); // 'a4' | 'legal' | ''
      const row = await Model.getById(id);
      if (!row) return res.status(404).json({ error: 'Not found' });

      let html = row.content || '';
      const desired = pageParam === 'legal' ? 'Legal' : 'A4';
      html = applyPageShell(html, desired);
      console.log('📄 HTML length:', html.length);

      const pdfBuffer = await renderPdfBuffer(html);
      const size = Buffer.isBuffer(pdfBuffer)
        ? pdfBuffer.length
        : (pdfBuffer?.byteLength ?? pdfBuffer?.length ?? 0);

      console.log('📦 PDF buffer size:', size);
      if (!size || size < 1000) {
        console.error('❌ Invalid or empty PDF buffer generated (size:', size, ')');
        return res.status(500).json({ error: 'Failed to generate valid PDF' });
      }

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

  /* ============== On-the-fly (unsaved) PDF render ============== */
  async pdfFromHtml(req, res) {
    try {
      const {
        html,
        templateContent,
        variables = {},
        page = 'A4',               // 'A4' | 'Legal'
        disposition = 'attachment',
        name = 'document'
      } = req.body || {};

      let inner = html;
      if (!inner) {
        if (!templateContent)
          return res.status(400).json({ error: 'Provide html OR (templateContent + variables).' });
        inner = interpolate(templateContent, variables);
      }

      // Only wrap if your HTML doesn't already provide the print shell
      const wrapped = applyPageShell(inner, page);
      console.log('📄 HTML length:', wrapped.length);

      const pdfBuffer = await renderPdfBuffer(wrapped);
      const size = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : (pdfBuffer?.byteLength ?? pdfBuffer?.length ?? 0);
      console.log('📦 PDF buffer size:', size);

      if (!size || size < 1000) {
        console.error('❌ Invalid or empty PDF buffer generated.');
        return res.status(500).json({ error: 'Failed to generate valid PDF' });
      }

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
};

module.exports = DocumentsGeneratedController;
