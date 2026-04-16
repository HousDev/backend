// controllers/variable.controller.js
const Variable = require('../models/VariableModel');
const db = require('../config/database');
// Helper: normalize status & basic validation
const asStatus = (v) => (v === 'inactive' ? 'inactive' : 'active');

// controllers/variable.controller.js
// controllers/variable.controller.js
exports.getAllVariables = async (req, res) => {
  try {
    res.set('X-Handler', 'variables.getAllVariables');   // <-- tag
    const [dbName] = await db.query('SELECT DATABASE() AS db');

    const [[cnt]] = await db.query('SELECT COUNT(*) AS c FROM variables');

    const data = await Variable.findAll();
    return res.json({ success: true, count: cnt.c, data });
  } catch (err) {
    console.error('getAllVariables error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};







exports.getVariablesByTab = async (req, res) => {
  try {
    const tabId = String(req.params.tabId || '').trim().toLowerCase();
    if (!tabId) {
      return res.status(400).json({ success: false, message: 'tabId is required' });
    }
    const data = await Variable.findAllByTab(tabId); // must filter by variable_tab_id
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getVariablesByTab error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createVariable = async (req, res) => {
  try {
    const {
      name,
      variable_key,
      placeholder,
      variable_tab_id,
      category,
      status,
    } = req.body || {};

    if (!name || !variable_key || !placeholder || !variable_tab_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, variable_key, placeholder, variable_tab_id',
      });
    }

    // Optional stricter validations
    if (!/^[a-z0-9_]+$/.test(variable_key)) {
      return res.status(400).json({
        success: false,
        message: 'variable_key must be lowercase alphanumeric/underscore only',
      });
    }
    const expectedPlaceholder = `{{${variable_key}}}`;
    if (placeholder !== expectedPlaceholder) {
      return res.status(400).json({
        success: false,
        message: `placeholder must be exactly ${expectedPlaceholder}`,
      });
    }

    const payload = {
      name: String(name).trim(),
      variable_key: String(variable_key).trim(),
      placeholder: String(placeholder).trim(),
      variable_tab_id: String(variable_tab_id).trim().toLowerCase(),
      category: String(category || variable_tab_id).trim().toLowerCase(), // per your spec
      status: asStatus(status),
    };

    const id = await Variable.create(payload);
    return res.json({ success: true, id });
  } catch (err) {
    console.error('createVariable error:', err);
    return res.status(500).json({
      success: false,
      message: err?.code === 'ER_DUP_ENTRY' ? 'Variable already exists' : 'Server error',
    });
  }
};

exports.updateVariable = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const { name, variable_key, placeholder, status } = req.body || {};
    if (!name || !variable_key || !placeholder) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, variable_key, placeholder',
      });
    }

    if (!/^[a-z0-9_]+$/.test(variable_key)) {
      return res.status(400).json({
        success: false,
        message: 'variable_key must be lowercase alphanumeric/underscore only',
      });
    }
    const expectedPlaceholder = `{{${variable_key}}}`;
    if (placeholder !== expectedPlaceholder) {
      return res.status(400).json({
        success: false,
        message: `placeholder must be exactly ${expectedPlaceholder}`,
      });
    }

    await Variable.update(id, {
      name: String(name).trim(),
      variable_key: String(variable_key).trim(),
      placeholder: String(placeholder).trim(),
      status: asStatus(status),
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('updateVariable error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.deleteVariable = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    await Variable.delete(id);
    return res.json({ success: true });
  } catch (err) {
    console.error('deleteVariable error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.bulkDeleteVariables = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'No ids provided' });
    }
    await Variable.bulkDelete(ids);
    return res.json({ success: true });
  } catch (err) {
    console.error('bulkDeleteVariables error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'No ids provided' });
    }
    const normalized = asStatus(status);
    await Variable.bulkUpdateStatus(ids, normalized);
    return res.json({ success: true });
  } catch (err) {
    console.error('bulkUpdateStatus error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
