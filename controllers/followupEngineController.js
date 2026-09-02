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

      const nextStageId = req.body.nextStageId || matchedRule?.next_stage_id || currentStageId || null;
      const nextStatusId = req.body.nextStatusId || matchedRule?.next_status_id || currentStatusId || null;
      const nextAction = req.body.nextAction || matchedRule?.next_action || 'Follow-up Customer';
      const priority = req.body.priority || matchedRule?.priority || 'Medium';
      const slaHours = req.body.slaHours || matchedRule?.sla_hours || 48;
      const ruleId = matchedRule?.id || null;
      const ruleVersion = matchedRule?.version || '1.0';

      // Clean entityId if it has prefix like 'LD-1024' or 'B-5'
      let cleanEntityId = entityId;
      if (typeof cleanEntityId === 'string' && /^[A-Za-z]+-\d+$/.test(cleanEntityId)) {
        cleanEntityId = cleanEntityId.split('-')[1];
      }

      // 2. Insert Follow-up Record into Respective Entity Table
      let followupInsertId = null;
      const followupUuid = uuidv4();
      const defaultTitle = `${followupType} - ${outcomeName || 'Followup'}`;

      // Helper to format DATE string for MySQL (YYYY-MM-DD)
      const formatScheduleDate = (val) => {
        if (!val) return null;
        const str = String(val).trim();
        if (str.includes('T')) return str.split('T')[0];
        if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
        return str;
      };

      const finalScheduleDate = formatScheduleDate(scheduledDate);

      const currentStageName = req.body.currentStageName || req.body.stage || matchedRule?.trigger_stage_name || null;
      const currentStatusName = req.body.currentStatusName || req.body.status || null;

      const nextStageName = req.body.nextStageName || matchedRule?.next_stage_name || currentStageName || null;
      const nextStatusName = req.body.nextStatusName || matchedRule?.next_status_name || currentStatusName || null;

      const followupStageName = nextStageName || currentStageName;
      const followupStatusName = nextStatusName || currentStatusName;

      const isEdit = req.body.isEdit === true;
      const editingFollowupId = isEdit ? (req.body.followupId || req.body.id || null) : null;
      const outcomeStr = outcomeName ? (reason ? `${outcomeName} - ${reason}` : outcomeName) : null;

      if (editingFollowupId && isEdit) {
        if (normEntity === 'lead') {
          await connection.query(
            `UPDATE followups
             SET type = ?, status = ?, stage = ?, remark = ?, customRemark = ?, next_action = ?,
                 scheduled_date = ?, updated_at = NOW()
             WHERE id = ?`,
            [
              followupType,
              followupStatusName,
              followupStageName,
              outcomeStr,
              notes,
              nextAction,
              finalScheduleDate,
              editingFollowupId
            ]
          );
          followupInsertId = editingFollowupId;
        } else if (normEntity === 'buyer') {
          let baseTime = scheduledTime || '11:30:00';
          if (baseTime.length === 5) baseTime += ':00';

          const timeParts = baseTime.split(':');
          const initH = parseInt(timeParts[0] || '11', 10);
          const initM = parseInt(timeParts[1] || '30', 10);
          const initS = parseInt(timeParts[2] || '0', 10);
          let totalSeconds = (initH * 3600) + (initM * 60) + initS;

          let updated = false;
          let attempts = 0;
          while (!updated && attempts < 500) {
            const curH = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
            const curM = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const curS = String(totalSeconds % 60).padStart(2, '0');
            const timeToUse = `${curH}:${curM}:${curS}`;

            try {
              await connection.query(
                `UPDATE buyer_followups
                 SET followup_type = ?, buyer_lead_stage = ?, buyer_lead_status = ?, remark = ?, custom_remark = ?,
                     next_action = ?, schedule_date = ?, schedule_time = ?, priority = ?, updated_at = NOW()
                 WHERE id = ?`,
                [
                  followupType,
                  followupStageName,
                  followupStatusName,
                  outcomeStr,
                  notes,
                  nextAction,
                  finalScheduleDate,
                  timeToUse,
                  priority,
                  editingFollowupId
                ]
              );
              followupInsertId = editingFollowupId;
              updated = true;
            } catch (errUpd) {
              if (errUpd.code === 'ER_DUP_ENTRY' || errUpd.errno === 1062) {
                attempts++;
                totalSeconds++;
              } else {
                throw errUpd;
              }
            }
          }
        } else if (normEntity === 'seller') {
          let baseTime = scheduledTime || '11:30:00';
          if (baseTime.length === 5) baseTime += ':00';

          const timeParts = baseTime.split(':');
          const initH = parseInt(timeParts[0] || '11', 10);
          const initM = parseInt(timeParts[1] || '30', 10);
          const initS = parseInt(timeParts[2] || '0', 10);
          let totalSeconds = (initH * 3600) + (initM * 60) + initS;

          let updated = false;
          let attempts = 0;
          while (!updated && attempts < 500) {
            const curH = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
            const curM = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const curS = String(totalSeconds % 60).padStart(2, '0');
            const timeToUse = `${curH}:${curM}:${curS}`;

            try {
              await connection.query(
                `UPDATE seller_followups
                 SET followup_type = ?, seller_lead_stage = ?, seller_lead_status = ?, remark = ?, custom_remark = ?,
                     next_action = ?, schedule_date = ?, schedule_time = ?, priority = ?, updated_at = NOW()
                 WHERE id = ?`,
                [
                  followupType,
                  followupStageName,
                  followupStatusName,
                  outcomeStr,
                  notes,
                  nextAction,
                  finalScheduleDate,
                  timeToUse,
                  priority,
                  editingFollowupId
                ]
              );
              followupInsertId = editingFollowupId;
              updated = true;
            } catch (errUpd) {
              if (errUpd.code === 'ER_DUP_ENTRY' || errUpd.errno === 1062) {
                attempts++;
                totalSeconds++;
              } else {
                throw errUpd;
              }
            }
          }
        }
      } else if (normEntity === 'lead') {
        const [resIns] = await connection.query(
          `INSERT INTO followups (
            id, lead_id, type, status, stage, remark, customRemark, next_action,
            scheduled_date, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            followupUuid,
            cleanEntityId,
            followupType,
            followupStatusName,
            followupStageName,
            outcomeStr,
            notes,
            nextAction,
            finalScheduleDate,
            userId
          ]
        );
        followupInsertId = followupUuid;
      } else if (normEntity === 'buyer') {
        let baseTime = scheduledTime || '11:30:00';
        if (baseTime.length === 5) baseTime += ':00';

        const timeParts = baseTime.split(':');
        const initH = parseInt(timeParts[0] || '11', 10);
        const initM = parseInt(timeParts[1] || '30', 10);
        const initS = parseInt(timeParts[2] || '0', 10);
        let totalSeconds = (initH * 3600) + (initM * 60) + initS;

        let inserted = false;
        let attempts = 0;
        while (!inserted && attempts < 500) {
          const curH = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
          const curM = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
          const curS = String(totalSeconds % 60).padStart(2, '0');
          const timeToUse = `${curH}:${curM}:${curS}`;

          try {
            const [resIns] = await connection.query(
              `INSERT INTO buyer_followups (
                buyer_id, followup_type, buyer_lead_stage, buyer_lead_status, remark, custom_remark, next_action,
                schedule_date, schedule_time, priority, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                cleanEntityId,
                followupType,
                followupStageName,
                followupStatusName,
                outcomeStr,
                notes,
                nextAction,
                finalScheduleDate,
                timeToUse,
                priority,
                userId
              ]
            );
            followupInsertId = resIns.insertId;
            inserted = true;
          } catch (errIns) {
            if (errIns.code === 'ER_DUP_ENTRY' || errIns.errno === 1062) {
              attempts++;
              totalSeconds++;
            } else {
              throw errIns;
            }
          }
        }

        if (!inserted) {
          throw new Error('Could not find an available time slot for this buyer followup');
        }
      } else if (normEntity === 'seller') {
        let baseTime = scheduledTime || '11:30:00';
        if (baseTime.length === 5) baseTime += ':00';

        const timeParts = baseTime.split(':');
        const initH = parseInt(timeParts[0] || '11', 10);
        const initM = parseInt(timeParts[1] || '30', 10);
        const initS = parseInt(timeParts[2] || '0', 10);
        let totalSeconds = (initH * 3600) + (initM * 60) + initS;

        let inserted = false;
        let attempts = 0;
        while (!inserted && attempts < 500) {
          const curH = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
          const curM = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
          const curS = String(totalSeconds % 60).padStart(2, '0');
          const timeToUse = `${curH}:${curM}:${curS}`;

          try {
            const [resIns] = await connection.query(
              `INSERT INTO seller_followups (
                seller_id, followup_type, seller_lead_stage, seller_lead_status, remark, custom_remark, next_action,
                schedule_date, schedule_time, priority, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                cleanEntityId,
                followupType,
                followupStageName,
                followupStatusName,
                outcomeStr,
                notes,
                nextAction,
                finalScheduleDate,
                timeToUse,
                priority,
                userId
              ]
            );
            followupInsertId = resIns.insertId;
            inserted = true;
          } catch (errIns) {
            if (errIns.code === 'ER_DUP_ENTRY' || errIns.errno === 1062) {
              attempts++;
              totalSeconds++;
            } else {
              throw errIns;
            }
          }
        }

        if (!inserted) {
          throw new Error('Could not find an available time slot for this seller followup');
        }
      }

      // 3. Update Entity Record (leads / buyers / sellers)
      try {
        if (normEntity === 'lead') {
          try {
            await connection.query(
              `UPDATE leads
               SET stage = COALESCE(?, stage),
                   status = COALESCE(?, status),
                   stage_id = COALESCE(?, stage_id),
                   status_id = COALESCE(?, status_id),
                   updated_at = NOW()
               WHERE id = ?`,
              [nextStageName, nextStatusName, nextStageId, nextStatusId, cleanEntityId]
            );
          } catch (e1) {
            await connection.query(
              `UPDATE leads SET stage = COALESCE(?, stage), status = COALESCE(?, status) WHERE id = ?`,
              [nextStageName, nextStatusName, cleanEntityId]
            ).catch(() => {});
          }
          try {
            await connection.query(
              `UPDATE client_leads SET stage = COALESCE(?, stage), status = COALESCE(?, status) WHERE id = ?`,
              [nextStageName, nextStatusName, cleanEntityId]
            );
          } catch (e2) {}
        } else if (normEntity === 'buyer') {
          await connection.query(
            `UPDATE buyers
             SET buyer_lead_stage = COALESCE(?, buyer_lead_stage),
                 buyer_lead_status = COALESCE(?, buyer_lead_status),
                 stage = COALESCE(?, stage),
                 status = COALESCE(?, status),
                 updated_at = NOW()
             WHERE id = ?`,
            [nextStageName, nextStatusName, nextStageName, nextStatusName, cleanEntityId]
          );
        } else if (normEntity === 'seller') {
          await connection.query(
            `UPDATE sellers
             SET seller_lead_stage = COALESCE(?, seller_lead_stage),
                 seller_lead_status = COALESCE(?, seller_lead_status),
                 stage = COALESCE(?, stage),
                 status = COALESCE(?, status),
                 updated_at = NOW()
             WHERE id = ?`,
            [nextStageName, nextStatusName, nextStageName, nextStatusName, cleanEntityId]
          );
        }
      } catch (errUpdate) {
        console.warn(`Could not update ${normEntity} stage/status:`, errUpdate.message);
      }

      // 4. Record Audit Log Entry (Safe execution)
      try {
        await AutomationMasterModel.createAuditLog(connection, {
          entity: normEntity,
          entity_id: cleanEntityId,
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
      } catch (errAudit) {
        console.warn('Audit log creation skipped/failed:', errAudit.message);
      }

      // 5. Increment Rule Execution Count if matched
      if (ruleId) {
        try {
          await connection.query(
            `UPDATE automation_rules SET execution_count = execution_count + 1, last_executed_at = NOW() WHERE id = ?`,
            [ruleId]
          );
        } catch (errRuleCount) {
          console.warn('Could not increment rule execution count:', errRuleCount.message);
        }
      }

      // Commit Transaction
      await connection.commit();

      return res.status(200).json({
        success: true,
        message: 'Follow-up submitted & automation rule executed successfully',
        data: {
          id: followupInsertId,
          followupId: followupInsertId,
          buyer_id: cleanEntityId,
          buyerId: cleanEntityId,
          seller_id: cleanEntityId,
          sellerId: cleanEntityId,
          followup_type: followupType,
          followupType: followupType,
          type: followupType,
          buyer_lead_stage: followupStageName,
          buyerLeadStage: followupStageName,
          stage: followupStageName,
          buyer_lead_status: followupStatusName,
          buyerLeadStatus: followupStatusName,
          status: followupStatusName,
          remark: outcomeStr,
          custom_remark: notes,
          customRemark: notes,
          next_action: nextAction,
          nextAction: nextAction,
          schedule_date: finalScheduleDate,
          scheduleDate: finalScheduleDate,
          date: finalScheduleDate,
          schedule_time: scheduledTime || '11:30:00',
          scheduleTime: scheduledTime || '11:30:00',
          time: scheduledTime || '11:30:00',
          priority: priority,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
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
        message: 'Follow-up processing failed: ' + error.message,
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
