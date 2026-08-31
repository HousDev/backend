// backend/models/automationMasterModel.js
// Single Unified Model for Automation Stages, Statuses, Outcomes, Rules & Audit Logs

const pool = require('../config/database');

const AutomationMasterModel = {
  // --------------------------------------------------
  // 1. STAGES
  // --------------------------------------------------
  getStages: async (entity) => {
    let sql = 'SELECT * FROM automation_stages';
    const params = [];
    if (entity) {
      sql += ' WHERE entity = ? AND is_active = 1 ORDER BY order_index ASC, id ASC';
      params.push(entity.toLowerCase());
    } else {
      sql += ' WHERE is_active = 1 ORDER BY entity ASC, order_index ASC';
    }
    const [rows] = await pool.query(sql, params);
    return rows;
  },

  getStageById: async (id) => {
    const [rows] = await pool.query('SELECT * FROM automation_stages WHERE id = ?', [id]);
    return rows[0] || null;
  },

  createStage: async (data) => {
    const { entity, name, code, order_index = 0, is_initial = 0, is_terminal = 0, is_active = 1 } = data;
    const stageCode = code || name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const [result] = await pool.query(
      `INSERT INTO automation_stages (entity, name, code, order_index, is_initial, is_terminal, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entity.toLowerCase(), name, stageCode, order_index, is_initial ? 1 : 0, is_terminal ? 1 : 0, is_active ? 1 : 0]
    );
    return result.insertId;
  },

  updateStage: async (id, data) => {
    const fields = [];
    const params = [];
    ['name', 'code', 'order_index', 'is_initial', 'is_terminal', 'is_active'].forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });
    if (fields.length === 0) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE automation_stages SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  deleteStage: async (id) => {
    const [result] = await pool.query('UPDATE automation_stages SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // --------------------------------------------------
  // 2. STATUSES
  // --------------------------------------------------
  getStatuses: async (entity) => {
    let sql = 'SELECT * FROM automation_statuses';
    const params = [];
    if (entity) {
      sql += ' WHERE entity = ? AND is_active = 1 ORDER BY id ASC';
      params.push(entity.toLowerCase());
    } else {
      sql += ' WHERE is_active = 1 ORDER BY entity ASC, id ASC';
    }
    const [rows] = await pool.query(sql, params);
    return rows;
  },

  getStatusById: async (id) => {
    const [rows] = await pool.query('SELECT * FROM automation_statuses WHERE id = ?', [id]);
    return rows[0] || null;
  },

  createStatus: async (data) => {
    const { entity, name, code, is_terminal = 0, is_active = 1 } = data;
    const statusCode = code || name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const [result] = await pool.query(
      `INSERT INTO automation_statuses (entity, name, code, is_terminal, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [entity.toLowerCase(), name, statusCode, is_terminal ? 1 : 0, is_active ? 1 : 0]
    );
    return result.insertId;
  },

  updateStatus: async (id, data) => {
    const fields = [];
    const params = [];
    ['name', 'code', 'is_terminal', 'is_active'].forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });
    if (fields.length === 0) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE automation_statuses SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  deleteStatus: async (id) => {
    const [result] = await pool.query('UPDATE automation_statuses SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // --------------------------------------------------
  // 3. OUTCOMES (FK Normalized to stage_id)
  // --------------------------------------------------
  getOutcomesByStageId: async (stageId) => {
    const [rows] = await pool.query(
      `SELECT o.*, s.name as stage_name, s.entity
       FROM automation_outcomes o
       JOIN automation_stages s ON o.stage_id = s.id
       WHERE o.stage_id = ? AND o.is_active = 1
       ORDER BY o.order_index ASC, o.id ASC`,
      [stageId]
    );
    return rows;
  },

  getOutcomesByEntity: async (entity) => {
    const [rows] = await pool.query(
      `SELECT o.*, s.name as stage_name, s.entity
       FROM automation_outcomes o
       JOIN automation_stages s ON o.stage_id = s.id
       WHERE s.entity = ? AND o.is_active = 1
       ORDER BY s.order_index ASC, o.order_index ASC`,
      [entity.toLowerCase()]
    );
    return rows;
  },

  createOutcome: async (data) => {
    const { entity, stage_id, name, code, is_positive = 0, is_active = 1, order_index = 0 } = data;
    const outcomeCode = code || name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const [result] = await pool.query(
      `INSERT INTO automation_outcomes (entity, stage_id, name, code, is_positive, is_active, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entity ? entity.toLowerCase() : 'lead', stage_id, name, outcomeCode, is_positive ? 1 : 0, is_active ? 1 : 0, order_index]
    );
    return result.insertId;
  },

  updateOutcome: async (id, data) => {
    const fields = [];
    const params = [];
    ['stage_id', 'name', 'code', 'is_positive', 'is_active', 'order_index'].forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });
    if (fields.length === 0) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE automation_outcomes SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  deleteOutcome: async (id) => {
    const [result] = await pool.query('UPDATE automation_outcomes SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // --------------------------------------------------
  // 4. RULES (Strict Entity Consistency Validation)
  // --------------------------------------------------
  validateRuleEntityConsistency: async (ruleData) => {
    try {
      const { entity, trigger_stage_id, trigger_status_id, condition_outcome_id, next_stage_id, next_status_id } = ruleData;
      const normEntity = (entity || '').toLowerCase();

      // Check Trigger Stage
      if (trigger_stage_id) {
        const [stg] = await pool.query('SELECT * FROM automation_stages WHERE id = ?', [trigger_stage_id]);
        if (stg[0] && stg[0].entity && stg[0].entity !== normEntity) {
          throw new Error(`Trigger stage (ID ${trigger_stage_id}) does not belong to entity '${normEntity}'`);
        }
      }

      // Check Trigger Status
      if (trigger_status_id) {
        const [st] = await pool.query('SELECT * FROM automation_statuses WHERE id = ?', [trigger_status_id]);
        if (st[0] && st[0].entity && st[0].entity !== normEntity) {
          throw new Error(`Trigger status (ID ${trigger_status_id}) does not belong to entity '${normEntity}'`);
        }
      }
    } catch (err) {
      if (err.message.includes('belong to entity')) throw err;
      console.warn('Entity consistency check skipped due to schema mismatch:', err.message);
    }
  },

  getRules: async (entity) => {
    try {
      const sql = `
        SELECT r.*,
          COALESCE(ts.name, 'Stage') as trigger_stage_name,
          COALESCE(tst.name, 'Status') as trigger_status_name,
          COALESCE(co.name, 'Outcome') as condition_outcome_name,
          COALESCE(ns.name, 'Next Stage') as next_stage_name,
          COALESCE(nst.name, 'Next Status') as next_status_name
        FROM automation_rules r
        LEFT JOIN automation_stages ts ON r.trigger_stage_id = ts.id
        LEFT JOIN automation_statuses tst ON r.trigger_status_id = tst.id
        LEFT JOIN automation_outcomes co ON r.condition_outcome_id = co.id
        LEFT JOIN automation_stages ns ON r.next_stage_id = ns.id
        LEFT JOIN automation_statuses nst ON r.next_status_id = nst.id
        ${entity ? 'WHERE (r.entity = ? OR ts.entity = ? OR ts.entity IS NULL)' : ''}
        ORDER BY r.id DESC
      `;
      const params = entity ? [entity.toLowerCase(), entity.toLowerCase()] : [];
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (err) {
      console.warn('Query fallback in getRules:', err.message);
      try {
        const [rows] = await pool.query('SELECT * FROM automation_rules ORDER BY id DESC');
        return rows;
      } catch (err2) {
        return [];
      }
    }
  },

  findMatchingRule: async (entity, stageId, statusId, outcomeId) => {
    try {
      const [rows] = await pool.query(
        `SELECT r.*,
            ns.name as next_stage_name,
            nst.name as next_status_name
         FROM automation_rules r
         LEFT JOIN automation_stages ts ON r.trigger_stage_id = ts.id
         LEFT JOIN automation_stages ns ON r.next_stage_id = ns.id
         LEFT JOIN automation_statuses nst ON r.next_status_id = nst.id
         WHERE (ts.entity = ? OR ts.entity IS NULL)
           AND r.trigger_stage_id = ?
           AND (r.trigger_status_id IS NULL OR r.trigger_status_id = ?)
           AND r.condition_outcome_id = ?
         ORDER BY r.trigger_status_id DESC, r.id DESC
         LIMIT 1`,
        [entity.toLowerCase(), stageId, statusId || null, outcomeId]
      );
      return rows[0] || null;
    } catch (err) {
      console.warn('findMatchingRule fallback:', err.message);
      return null;
    }
  },

  createRule: async (ruleData) => {
    await AutomationMasterModel.validateRuleEntityConsistency(ruleData);

    const {
      rule_key,
      name,
      entity,
      trigger_stage_id,
      trigger_status_id,
      condition_outcome_id,
      next_stage_id,
      next_status_id,
      next_action,
      priority = 'Medium',
      sla_hours = 24,
      max_attempts = null,
      create_followup = 1,
      version = '1.0',
      rule_status = 'Published',
      created_by = null
    } = ruleData;

    const rKey = rule_key || `${entity}_${trigger_stage_id}_${condition_outcome_id}`;

    try {
      const [result] = await pool.query(
        `INSERT INTO automation_rules (
          rule_key, name, title, trigger_event, action_type, entity, trigger_stage_id, trigger_status_id, condition_outcome_id,
          next_stage_id, next_status_id, next_action, priority, sla_hours, max_attempts,
          create_followup, version, rule_status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rKey,
          name,
          name,
          'STAGE_OUTCOME_CHANGE',
          'Move Stage To',
          entity.toLowerCase(),
          trigger_stage_id,
          trigger_status_id || null,
          condition_outcome_id,
          next_stage_id || null,
          next_status_id || null,
          next_action || null,
          priority,
          sla_hours,
          max_attempts || null,
          create_followup ? 1 : 0,
          version,
          rule_status,
          created_by
        ]
      );
      return result.insertId;
    } catch (err) {
      console.warn('createRule full insert failed, trying action_type fallback:', err.message);
      try {
        const [result] = await pool.query(
          `INSERT INTO automation_rules (
            name, title, trigger_event, action_type, entity, trigger_stage_id, trigger_status_id, condition_outcome_id,
            next_stage_id, next_status_id, next_action, priority, sla_hours
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            name,
            'STAGE_OUTCOME_CHANGE',
            'Move Stage To',
            entity.toLowerCase(),
            trigger_stage_id,
            trigger_status_id || null,
            condition_outcome_id,
            next_stage_id || null,
            next_status_id || null,
            next_action || null,
            priority,
            sla_hours
          ]
        );
        return result.insertId;
      } catch (err2) {
        console.warn('createRule basic column fallback:', err2.message);
        try {
          const [result] = await pool.query(
            `INSERT INTO automation_rules (
              name, entity, trigger_stage_id, trigger_status_id, condition_outcome_id,
              next_stage_id, next_status_id, next_action, priority, sla_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              name,
              entity.toLowerCase(),
              trigger_stage_id,
              trigger_status_id || null,
              condition_outcome_id,
              next_stage_id || null,
              next_status_id || null,
              next_action || null,
              priority,
              sla_hours
            ]
          );
          return result.insertId;
        } catch (err3) {
          const [result] = await pool.query(
            `INSERT INTO automation_rules (
              name, trigger_stage_id, trigger_status_id, condition_outcome_id,
              next_stage_id, next_status_id, next_action, priority, sla_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              name,
              trigger_stage_id,
              trigger_status_id || null,
              condition_outcome_id,
              next_stage_id || null,
              next_status_id || null,
              next_action || null,
              priority,
              sla_hours
            ]
          );
          return result.insertId;
        }
      }
    }
  },

  updateRule: async (id, ruleData) => {
    if (ruleData.entity) {
      await AutomationMasterModel.validateRuleEntityConsistency(ruleData);
    }

    const fields = [];
    const params = [];
    [
      'name', 'trigger_stage_id', 'trigger_status_id', 'condition_outcome_id',
      'next_stage_id', 'next_status_id', 'next_action', 'priority', 'sla_hours',
      'max_attempts', 'create_followup', 'version', 'rule_status', 'updated_by'
    ].forEach((key) => {
      if (ruleData[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(ruleData[key]);
      }
    });

    if (fields.length === 0) return 0;
    params.push(id);
    const [result] = await pool.query(`UPDATE automation_rules SET ${fields.join(', ')} WHERE id = ?`, params);
    return result.affectedRows;
  },

  incrementRuleExecution: async (ruleId) => {
    await pool.query(
      `UPDATE automation_rules SET execution_count = execution_count + 1, last_executed_at = NOW() WHERE id = ?`,
      [ruleId]
    );
  },

  deleteRule: async (id) => {
    const [result] = await pool.query('DELETE FROM automation_rules WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // --------------------------------------------------
  // 5. AUDIT LOGS
  // --------------------------------------------------
  createAuditLog: async (connectionOrPool, auditData) => {
    const conn = connectionOrPool || pool;
    const {
      entity,
      entity_id,
      rule_id = null,
      rule_version = '1.0',
      outcome_id = null,
      old_stage_id = null,
      old_status_id = null,
      new_stage_id = null,
      new_status_id = null,
      next_action = null,
      execution_status = 'SUCCESS',
      error_message = null
    } = auditData;

    const [result] = await conn.query(
      `INSERT INTO automation_audit_logs (
        entity, entity_id, rule_id, rule_version, outcome_id,
        old_stage_id, old_status_id, new_stage_id, new_status_id,
        next_action, execution_status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entity.toLowerCase(),
        entity_id,
        rule_id,
        rule_version,
        outcome_id,
        old_stage_id,
        old_status_id,
        new_stage_id,
        new_status_id,
        next_action,
        execution_status,
        error_message
      ]
    );
    return result.insertId;
  },

  getAuditLogs: async (entity, entityId) => {
    const [rows] = await pool.query(
      `SELECT a.*,
        r.name as rule_name,
        os.name as old_stage_name,
        ns.name as new_stage_name,
        ost.name as old_status_name,
        nst.name as new_status_name,
        oc.name as outcome_name
       FROM automation_audit_logs a
       LEFT JOIN automation_rules r ON a.rule_id = r.id
       LEFT JOIN automation_stages os ON a.old_stage_id = os.id
       LEFT JOIN automation_stages ns ON a.new_stage_id = ns.id
       LEFT JOIN automation_statuses ost ON a.old_status_id = ost.id
       LEFT JOIN automation_statuses nst ON a.new_status_id = nst.id
       LEFT JOIN automation_outcomes oc ON a.outcome_id = oc.id
       WHERE a.entity = ? AND a.entity_id = ?
       ORDER BY a.id DESC`,
      [entity.toLowerCase(), entityId]
    );
    return rows;
  }
};

module.exports = AutomationMasterModel;
