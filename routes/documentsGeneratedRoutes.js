const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentsGeneratedController');

// GET /api/documents-generated -> get all
router.get('/', ctrl.getAll);

// CREATE
router.post('/', ctrl.create);

// GET ONE
router.get('/:id', ctrl.getOne);

// UPDATE
router.put('/:id', ctrl.update);
router.patch('/:id', ctrl.update);

// SOFT DELETE / RESTORE / HARD DELETE
router.post('/:id/soft-delete', ctrl.softDelete);
router.post('/:id/restore', ctrl.restore);
router.delete('/:id', ctrl.hardDelete);
router.get('/:id/pdf', ctrl.pdf);           // inline OR download via ?disposition=
router.get('/:id/download', ctrl.downloadPdf); // (optional) legacy download
router.post('/pdf', ctrl.pdfFromHtml);      // on-the-fly render
module.exports = router;
