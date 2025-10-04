const Model = require('../models/documentsGeneratedModel');

// simple {{var}} interpolation
function interpolate(html, vars = {}) {
  return String(html).replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), vars);
    return (val ?? '').toString();
  });
}
const trimOrNull = (v) => (v == null ? null : String(v).trim() || null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

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
        content,            // final filled HTML (preferred)
        templateContent,    // raw template with {{placeholders}}
        variables,          // object
        status = 'draft',
      } = req.body || {};

      const finalName = trimOrNull(name) || trimOrNull(title);
      if (!finalName) {
        return res.status(400).json({ error: 'name is required' });
      }

      // decide finalHtml
      let finalHtml = content;
      if (!finalHtml) {
        if (!templateContent) {
          return res.status(400).json({
            error: "Provide either 'content' or 'templateContent'.",
          });
        }
        if (!isObj(variables)) {
          return res.status(400).json({
            error: "For interpolation, 'variables' must be an object map.",
          });
        }
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

  // ✅ GET ALL (no pagination/filters by default)
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

      // recompute content if needed
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

  // SOFT DELETE
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

  // RESTORE
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

  // HARD DELETE
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
};

module.exports = DocumentsGeneratedController;
