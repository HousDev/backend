const Variable = require('../models/VariableModel');


exports.getVariablesByTab = async (req, res) => {
    try {
        const tabId = req.params.tabId;
        const data = await Variable.findAllByTab(tabId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.createVariable = async (req, res) => {
    try {
        const { name, variableName, variableTabId, status } = req.body;
        const id = await Variable.create({ name, variableName, variableTabId, status });
        res.json({ success: true, id });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.code === 'ER_DUP_ENTRY' ? 'Variable already exists' : 'Server error'
        });
    }
};

exports.updateVariable = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, variableName, status } = req.body;
        await Variable.update(id, { name, variableName, status });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteVariable = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await Variable.delete(id);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.bulkDeleteVariables = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length)
            return res.status(400).json({ success: false, message: 'No ids provided' });
        await Variable.bulkDelete(ids);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.bulkUpdateStatus = async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || !ids.length)
            return res.status(400).json({ success: false, message: 'No ids provided' });
        await Variable.bulkUpdateStatus(ids, status);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

