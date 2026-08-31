// backend/controllers/followupEngineController.js
// Transactional Follow-up Submission, Rule Matching Engine & Timeline History

const pool = require('../config/database');
const AutomationMasterModel = require('../models/automationMasterModel');
const { v4: uuidv4 } = require('uuid');

const followupEngineController = {
  // ----------------------------------------------------
  // SUBMIT FOLLOW-UP (Transactional BEGIN ... COMMIT / ROLLBACK)
  // ----------------------------------------------------
  submitFollowup: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        entity = 'lead',
        entityId,
        followupType = 'phone',
        outcomeId,
        outcomeName,
        reason = null,
        notes = '',
        currentStageId,
        currentStatusId,
        userId = null,
        scheduledDate = null,
        scheduledTime = '11:00'
      } = req.body;

      if (!entityId) {
        throw new Error('Missing required field: entityId');
      }

      const normEntity = entity.toLowerCase();

      // 1. Match Rule from DB Matrix
      let matchedRule = null;
      if (outcomeId && currentStageId) {
        matchedRule = await AutomationMasterModel.findMatchingRule(
          normEntity,
          currentStageId,
          currentStatusId,
          outcomeId
        );
      }

      const nextStageId = matchedRule?.next_stage_id || currentStageId || null;
      const nextStatusId = matchedRule?.next_status_id || currentStatusId || null;
      const nextAction = matchedRule?.next_action || 'Follow-up Customer';
      const priority = matchedRule?.priority || 'Medium';
      const slaHours = matchedRule?.sla_hours || 48;
      const ruleId = matchedRule?.id || null;
      const ruleVersion = matchedRule?.version || '1.0';

      // 2. Insert Follow-up Record into Respective Entity Table
      let followupInsertId = null;
      const followupUuid = uuidv4();
      const defaultTitle = `${followupType} - ${outcomeName || 'Followup'}`;

      if (normEntity === 'lead') {
        try {
          const [resIns] = await connection.query(
            `INSERT INTO followups (
              id, lead_id, type, status, stage, remark, customRemark, next_action,
              scheduled_date, created_by, priority, title, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              followupUuid,
              entityId,
              followupType,
              matchedRule?.next_status_name || null,
              matchedRule?.next_stage_name || null,
              outcomeName || null,
              notes,
              nextAction,
              scheduledDate || null,
              userId,
              priority,
              defaultTitle
            ]
          );
          followupInsertId = followupUuid;
        } catch (errLead) {
          const [resIns] = await connection.query(
            `INSERT INTO followups (
              id, lead_id, type, status, stage, remark, customRemark, next_action,
              scheduled_date, created_by, priority, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              followupUuid,
              entityId,
              followupType,
              matchedRule?.next_status_name || null,
              matchedRule?.next_stage_name || null,
              outcomeName || null,
              notes,
              nextAction,
              scheduledDate || null,
              userId,
              priority
            ]
          );
          followupInsertId = followupUuid;
        }
      } else if (normEntity === 'buyer') {
        try {
          const [resIns] = await connection.query(
            `INSERT INTO buyer_followups (
              buyer_id, followup_type, outcome, reason, remarks, next_action,
              priority, next_followup_date, next_followup_time, title, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              entityId,
              followupType,
              outcomeName || null,
              reason,
              notes,
              nextAction,
              priority,
              scheduledDate || null,
              scheduledTime || '11:00:00',
              defaultTitle,
              userId
            ]
          );
          followupInsertId = resIns.insertId;
        } catch (errBuyer) {
          const [resIns] = await connection.query(
            `INSERT INTO buyer_followups (
              buyer_id, followup_type, outcome, reason, remarks, next_action,
              priority, next_followup_date, next_followup_time, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              entityId,
              followupType,
              outcomeName || null,
              reason,
              notes,
              nextAction,
              priority,
              scheduledDate || null,
              scheduledTime || '11:00:00',
              userId
            ]
          );
          followupInsertId = resIns.insertId;
        }
      } else if (normEntity === 'seller') {
        try {
          const [resIns] = await connection.query(
            `INSERT INTO seller_followups (
              seller_id, followup_type, outcome, reason, remarks, next_action,
              priority, next_followup_date, next_followup_time, title, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              entityId,
              followupType,
              outcomeName || null,
              reason,
              notes,
              nextAction,
              priority,
              scheduledDate || null,
              scheduledTime || '11:00:00',
              defaultTitle,
              userId
            ]
          );
          followupInsertId = resIns.insertId;
        } catch (errSeller) {
          const [resIns] = await connection.query(
            `INSERT INTO seller_followups (
              seller_id, followup_type, outcome, reason, remarks, next_action,
              priority, next_followup_date, next_followup_time, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              entityId,
              followupType,
              outcomeName || null,
              reason,
              notes,
              nextAction,
              priority,
              scheduledDate || null,
              scheduledTime || '11:00:00',
              userId
            ]
          );
          followupInsertId = resIns.insertId;
        }
      }

      // 3. Update Entity Record (leads / buyers / sellers)
      const targetTable = normEntity === 'lead' ? 'leads' : normEntity === 'buyer' ? 'buyers' : 'sellers';
      const isMissedOutcome = ['no answer', 'busy', 'call rejected'].some(m => (outcomeName || '').toLowerCase().includes(m));

      await connection.query(
        `UPDATE ${targetTable}
         SET stage_id = COALESCE(?, stage_id),
             status_id = COALESCE(?, status_id),
             priority = COALESCE(?, priority),
             consecutive_missed_count = IF(? = 1, consecutive_missed_count + 1, 0),
             updated_at = NOW()
         WHERE id = ?`,
        [nextStageId, nextStatusId, priority, isMissedOutcome ? 1 : 0, entityId]
      );

      // 4. Record Audit Log Entry
      await AutomationMasterModel.createAuditLog(connection, {
        entity: normEntity,
        entity_id: entityId,
        rule_id: ruleId,
        rule_version: ruleVersion,
        outcome_id: outcomeId || null,
        old_stage_id: currentStageId || null,
        old_status_id: currentStatusId || null,
        new_stage_id: nextStageId || null,
        new_status_id: nextStatusId || null,
        next_action: nextAction,
        execution_status: 'SUCCESS'
      });

      // 5. Increment Rule Execution Count if matched
      if (ruleId) {
        await connection.query(
          `UPDATE automation_rules SET execution_count = execution_count + 1, last_executed_at = NOW() WHERE id = ?`,
          [ruleId]
        );
      }

      // Commit Transaction
      await connection.commit();

      return res.status(200).json({
        success: true,
        message: 'Follow-up submitted & automation rule executed successfully',
        data: {
          followupId: followupInsertId,
          matchedRule: matchedRule ? {
            ruleId: matchedRule.id,
            version: matchedRule.version,
            nextStageId: matchedRule.next_stage_id,
            nextStageName: matchedRule.next_stage_name,
            nextStatusId: matchedRule.next_status_id,
            nextStatusName: matchedRule.next_status_name,
            nextAction: matchedRule.next_action,
            priority: matchedRule.priority,
            slaHours: matchedRule.sla_hours
          } : null
        }
      });
    } catch (error) {
      await connection.rollback();
      console.error('Transactional Follow-up Submission Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Follow-up processing failed. Transaction rolled back.',
        error: error.message
      });
    } finally {
      connection.release();
    }
  },

  // ----------------------------------------------------
  // GET FOLLOW-UP & AUDIT HISTORY TIMELINE
  // ----------------------------------------------------
  getFollowupHistory: async (req, res) => {
    try {
      const { entity, entityId } = req.params;
      const normEntity = (entity || 'lead').toLowerCase();

      let followups = [];
      if (normEntity === 'lead') {
        const [rows] = await pool.query(
          `SELECT * FROM followups WHERE lead_id = ? ORDER BY created_at DESC`,
          [entityId]
        );
        followups = rows;
      } else if (normEntity === 'buyer') {
        const [rows] = await pool.query(
          `SELECT * FROM buyer_followups WHERE buyer_id = ? ORDER BY created_at DESC`,
          [entityId]
        );
        followups = rows;
      } else if (normEntity === 'seller') {
        const [rows] = await pool.query(
          `SELECT * FROM seller_followups WHERE seller_id = ? ORDER BY created_at DESC`,
          [entityId]
        );
        followups = rows;
      }

      const auditLogs = await AutomationMasterModel.getAuditLogs(normEntity, entityId);

      return res.json({
        success: true,
        entity: normEntity,
        entityId,
        data: {
          followups,
          auditLogs
        }
      });
    } catch (error) {
      console.error('Error fetching followup history:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = followupEngineController;
