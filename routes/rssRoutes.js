// backend/routes/rssRoutes.js
const express = require('express');
const ctrl = require('../controllers/rssController');
const router = express.Router();

router.get('/', ctrl.list);
router.post('/', ctrl.create);

router.get('/validate', ctrl.validate);
router.get('/proxy', ctrl.proxy);
router.post('/sync-all', ctrl.syncAll);

router.post('/:id/sync', ctrl.syncOne);
router.patch('/:id/toggle', ctrl.toggle);

router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
