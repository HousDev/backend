// backend/services/automationMaster.service.js
// ResaleExpert CRM Master Automation Service for Lead, Buyer, and Seller

const db = require('../config/db');

/**
 * Process a completed follow-up and execute automation rules
 */
async function processFollowupAutomation(payload) {
  const {
    recordId,
    entity,
    followUpType,
    outcome,
    reason,
    note,
    nextStage,
    nextStatus,
    nextAction,
    priority,
    slaHours,
    nextFollowUp,
    userId
  } = payload;

  if (!recordId || !entity) return { success: false, message: 'Missing recordId or entity' };

  try {
    const table = entity === 'lead' ? 'leads' : entity === 'buyer' ? 'buyers' : 'sellers';
    const idColumn = 'id';

    // 1. Update current entity Stage, Status, Priority
    const updateSql = `
      UPDATE ${table} 
      SET 
        stage = ?, 
        status = ?, 
        priority = ?, 
        updated_at = NOW()
      WHERE ${idColumn} = ?
    `;
    await db.execute(updateSql, [nextStage, nextStatus, priority, recordId]);

    // 2. Insert into followups history table
    const insertFollowupSql = `
      INSERT INTO followups 
      (entity, entity_id, followup_type, outcome, reason, notes, stage, status, next_action, priority, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    await db.execute(insertFollowupSql, [
      entity,
      recordId,
      followUpType,
      outcome,
      reason || null,
      note || '',
      nextStage,
      nextStatus,
      nextAction,
      priority,
      userId || null
    ]);

    // 3. Create next scheduled follow-up task if requested
    if (nextFollowUp && nextFollowUp.date) {
      const insertTaskSql = `
        INSERT INTO followups 
        (entity, entity_id, followup_type, stage, status, next_action, priority, scheduled_date, scheduled_time, is_completed, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW())
      `;
      await db.execute(insertTaskSql, [
        entity,
        recordId,
        nextFollowUp.type || followUpType,
        nextStage,
        nextStatus,
        nextAction,
        priority,
        nextFollowUp.date,
        nextFollowUp.time || '11:00',
        userId || null
      ]);
    }

    return { success: true, message: 'Automation processed successfully' };
  } catch (error) {
    console.error('❌ Error processing followup automation:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  processFollowupAutomation
};
