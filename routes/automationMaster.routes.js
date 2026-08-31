// backend/routes/automationMaster.routes.js
// Express Router for Master Data, Stage Outcomes Lookup, Rules, and Transactional Follow-ups

const express = require('express');
const router = express.Router();
const automationMasterController = require('../controllers/automationMasterController');
const followupEngineController = require('../controllers/followupEngineController');

// Master Graph & Dynamic Outcome Lookups
router.get('/masters', automationMasterController.getMastersGraph);
router.get('/outcomes', automationMasterController.getOutcomesForStage);

// Stages CRUD
router.get('/stages', automationMasterController.getStages);
router.post('/stages', automationMasterController.createStage);
router.put('/stages/:id', automationMasterController.updateStage);
router.delete('/stages/:id', automationMasterController.deleteStage);

// Statuses CRUD
router.get('/statuses', automationMasterController.getStatuses);
router.post('/statuses', automationMasterController.createStatus);
router.put('/statuses/:id', automationMasterController.updateStatus);
router.delete('/statuses/:id', automationMasterController.deleteStatus);

// Outcomes CRUD
router.post('/outcomes', automationMasterController.createOutcome);
router.put('/outcomes/:id', automationMasterController.updateOutcome);
router.delete('/outcomes/:id', automationMasterController.deleteOutcome);

// Rules CRUD
router.get('/rules', automationMasterController.getRules);
router.post('/rules', automationMasterController.createRule);
router.put('/rules/:id', automationMasterController.updateRule);
router.delete('/rules/:id', automationMasterController.deleteRule);

// Audit Logs
router.get('/audit-logs/:entity/:entity_id', automationMasterController.getAuditLogs);

// Transactional Follow-up Submission & Timeline History
router.post('/followup/submit', followupEngineController.submitFollowup);
router.get('/followup/history/:entity/:entityId', followupEngineController.getFollowupHistory);

module.exports = router;
