// backend/corn/automationMasterCron.js
// Polling Cron Job for 15-min Due Reminders, Overdue Detection & Manager Escalation

const db = require('../config/db');

function startAutomationMasterCron() {
  console.log('🔄 [CRON] Follow-up Automation Master Engine initialized (Polling every 5m)');

  setInterval(async () => {
    try {
      // 1. Check Due Reminders (15 mins prior)
      const dueSql = `
        SELECT f.*, l.name as lead_name, b.full_name as buyer_name, s.full_name as seller_name
        FROM followups f
        LEFT JOIN leads l ON f.entity = 'lead' AND f.entity_id = l.id
        LEFT JOIN buyers b ON f.entity = 'buyer' AND f.entity_id = b.id
        LEFT JOIN sellers s ON f.entity = 'seller' AND f.entity_id = s.id
        WHERE f.is_completed = 0
          AND f.reminder_sent = 0
          AND f.scheduled_date = CURDATE()
          AND f.scheduled_time BETWEEN TIME(NOW()) AND TIME(DATE_ADD(NOW(), INTERVAL 15 MINUTE))
      `;
      const [dueRows] = await db.query(dueSql);
      if (dueRows && dueRows.length > 0) {
        for (const row of dueRows) {
          const name = row.lead_name || row.buyer_name || row.seller_name || 'Customer';
          console.log(`🔔 [REMINDER] Follow-up due in 15m for ${row.entity} ${name} (#${row.entity_id})`);
          await db.execute('UPDATE followups SET reminder_sent = 1 WHERE id = ?', [row.id]);
        }
      }

      // 2. Mark Overdue Follow-ups
      const overdueSql = `
        UPDATE followups 
        SET is_overdue = 1 
        WHERE is_completed = 0 
          AND is_overdue = 0 
          AND (scheduled_date < CURDATE() OR (scheduled_date = CURDATE() AND scheduled_time < TIME(NOW())))
      `;
      const [overdueResult] = await db.execute(overdueSql);
      if (overdueResult.affectedRows > 0) {
        console.log(`⚠️ [OVERDUE] Marked ${overdueResult.affectedRows} follow-ups as overdue`);
      }

    } catch (err) {
      console.error('❌ Error in Automation Master Cron:', err.message);
    }
  }, 5 * 60 * 1000); // 5 minutes interval
}

module.exports = {
  startAutomationMasterCron
};
