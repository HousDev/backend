// routes/documentsTemplateRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/DocumentsTemplateController');

// CRUD routes
router.post('/create', controller.create);            // Create template
router.get('/getall', controller.getAll);             // List all templates
router.get('/getbyid/:id', controller.getById);       // Get template by ID
router.put('/update/:id', controller.update);         // Update template
router.delete('/delete/:id', controller.delete);      // Delete template
router.post('/:id/use', controller.useTemplate);


module.exports = router;
