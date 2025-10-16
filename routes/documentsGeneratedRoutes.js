const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentsGeneratedController');
const { verifyToken } = require('../middleware/authJwt');

router.use(verifyToken);

// GET /api/documents-generated -> get all
router.get('/', ctrl.getAll);
router.get('/with-relations/getall', ctrl.getAllWithRelations);

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
router.get('/with-relations/:id', ctrl.getOneWithRelations);
// Get all documents with related entities

router.post('/bulk-download', ctrl.bulkDownloadZip);

router.post('/:id/save-pdf', ctrl.savePdfToStorage);
router.get('/documents/:id/preview.pdf', ctrl.previewPdfInline);

router.get('/:id/final-pdf', ctrl.downloadFinalPdf);
router.get('/documents/:id/verification-summary', ctrl.verificationSummary);
module.exports = router;
