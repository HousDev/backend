// controllers/DocumentsTemplateController.js
const DocumentsTemplate = require('../models/DocumentsTemplateModel');

/* ---------------- Helper: safe variable parsing ---------------- */
const safeParseVars = (val) => {
  try {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    if (typeof val === 'string' && val.trim()) return JSON.parse(val);
    return [];
  } catch {
    return [];
  }
};

/* ---------------- Controller ---------------- */
const DocumentsTemplateController = {
  // CREATE
  async create(req, res) {
    try {
      const data = req.body || {};
      if (!data.name || !data.content) {
        return res.status(400).json({ success: false, message: 'Missing required fields: name, content' });
      }

      const result = await DocumentsTemplate.create(data);
      return res.status(201).json({
        success: true,
        message: 'Template created successfully',
        id: result.insertId,
      });
    } catch (err) {
      console.error('create error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  },

  // GET ALL
  async getAll(req, res) {
    try {
      const filters = req.query || {};
      const rows = await DocumentsTemplate.getAll(filters);

      const sanitized = rows.map((t) => ({
        ...t,
        variables: safeParseVars(t.variables),
      }));

      return res.json({ success: true, count: sanitized.length, data: sanitized });
    } catch (err) {
      console.error('getAll error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  },

  // GET BY ID
  async getById(req, res) {
    try {
      const id = parseInt(req.params?.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

      const rows = await DocumentsTemplate.getById(id);
      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      const template = rows[0];
      template.variables = safeParseVars(template.variables);

      return res.json({ success: true, data: template });
    } catch (err) {
      console.error('getById error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  },

  // UPDATE
  async update(req, res) {
    try {
      const id = parseInt(req.params?.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

      const data = req.body || {};
      if (!data.name || !data.content) {
        return res.status(400).json({ success: false, message: 'Missing required fields: name, content' });
      }

      const result = await DocumentsTemplate.update(id, data);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      return res.json({ success: true, message: 'Template updated successfully' });
    } catch (err) {
      console.error('update error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  },

  // DELETE
  async delete(req, res) {
    try {
      const id = parseInt(req.params?.id, 10);
      if (!id) return res.status(400).json({ success: false, message: 'Invalid id' });

      const result = await DocumentsTemplate.delete(id);
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      return res.json({ success: true, message: 'Template deleted successfully' });
    } catch (err) {
      console.error('delete error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  },
  // Increment usage when a template is used

  async useTemplate(req, res) {
    try {
      const id = Number(req.params?.id);
      if (!id) {
        return res.status(400).json({ success: false, message: 'Template ID is required' });
      }

      const result = await DocumentsTemplate.incrementUsage(id);
      if (!result.affectedRows) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      const rows = await DocumentsTemplate.getById(id);
      const updated = rows[0] ? { ...rows[0], variables: safeParseVars(rows[0].variables) } : null;

      return res.json({
        success: true,
        message: 'Template usage recorded',
        data: updated,
      });
    } catch (err) {
      console.error('useTemplate error:', err);
      return res.status(500).json({ success: false, message: 'Failed to update template usage' });
    }
  },

};

module.exports = DocumentsTemplateController;
