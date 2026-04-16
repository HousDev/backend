// routes/propertyPaymentReceipt.routes.js
const express = require('express');
const ctrl = require('../controllers/propertyPaymentReceipt.controller');

const router = express.Router();

// Create
router.post('/', ctrl.create);

// Read single
router.get('/id/:id', ctrl.getById);
router.get('/rid/:receipt_id', ctrl.getByReceiptId);

// List (filters + pagination)
router.get('/', ctrl.list);

// Get ALL (no pagination) — admin/export
router.get('/all', ctrl.getAll);

// Update
router.patch('/:id', ctrl.update);

// Delete
router.delete('/:id', ctrl.remove);

module.exports = router;
