const express = require('express');
const router = express.Router();
const VariableController = require('../controllers/VariableController');
const {  uploadCsvMemory } = require('../middleware/upload');

// Get all variables for a tab
router.get('/:tabId', VariableController.getVariablesByTab);

// Create new variable
router.post('/', VariableController.createVariable);

// Update variable by ID
router.put('/:id', VariableController.updateVariable);

// Delete variable by ID
router.delete('/:id', VariableController.deleteVariable);

// Bulk delete variables
router.post('/bulk-delete', VariableController.bulkDeleteVariables);

// Bulk update status
router.post('/bulk-update-status', VariableController.bulkUpdateStatus);

module.exports = router;
