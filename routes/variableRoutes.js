const express = require('express');
const router = express.Router();
const VariableController = require('../controllers/VariableController');



// IMPORTANT: static route BEFORE the param route
router.get('/get-all', VariableController.getAllVariables);
router.get('/:tabId',  VariableController.getVariablesByTab);

router.post('/',       VariableController.createVariable);
router.put('/:id',     VariableController.updateVariable);
router.delete('/:id',  VariableController.deleteVariable);
router.post('/bulk-delete',        VariableController.bulkDeleteVariables);
router.post('/bulk-update-status', VariableController.bulkUpdateStatus);

module.exports = router;
