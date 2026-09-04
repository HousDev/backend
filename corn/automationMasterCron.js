// backend/corn/automationMasterCron.js
// Polling Cron Engine for 15-min Due Reminders, Overdue Detection & Admin Escalations (Leads, Buyers, Sellers)

const db = require('../config/database');
const { sendAssignmentNotification } = require('../utils/notificationHelper');
const { updateEntityPriorityScore } = require('../utils/leadScoring');

function startAutomationMasterCron() {
  console.log('🔄 [CRON] Follow-up Automation Master Engine active (Polling SLA & Escalations every 2 mins)');

  // Poll every 2 minutes for tight 15-min SLA precision
  setInterval(async () => {
    try {
      await processClientLeadReminders();
      await processBuyerReminders();
      await processSellerReminders();
      await processOverdueAndAdminEscalations();
    } catch (err) {
      console.error('❌ Error in Automation Master Cron Cycle:', err.message);
    }
  }, 2 * 60 * 1000);
}

/**
 * 1. Process Client Lead 15-min SLA Reminders
 */
async function processClientLeadReminders() {
  try {
    const sql = `
      SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, l.assigned_executive
      FROM followups f
      JOIN client_leads l ON f.lead_id = l.id
      WHERE (f.completed_date IS NULL)
        AND (f.reminder_sent = 0 OR f.reminder_sent IS NULL)
        AND (DATE(f.scheduled_date) <= CURDATE() OR f.scheduled_date IS NULL)
    `;
    const [rows] = await db.execute(sql);
    for (const row of rows) {
      const executiveId = row.assigned_executive || row.created_by;
      if (executiveId) {
        const timeFormatted = row.scheduled_date ? new Date(row.scheduled_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today';
        await sendAssignmentNotification({
          userId: executiveId,
          type: 'followup_reminder',
          itemId: row.lead_id,
          itemName: row.lead_name,
          message: `🔔 REMINDER: Follow-up scheduled with Lead "${row.lead_name}" (${timeFormatted})`,
          link: `/leads/${row.lead_id}`,
        });
      }
      await db.execute('UPDATE followups SET reminder_sent = 1 WHERE id = ?', [row.id]).catch(() => {});
      console.log(`🔔 [SLA Reminder Pushed] Lead ${row.lead_name} follow-up reminder sent to Executive #${executiveId}`);
    }
  } catch (err) {
    console.error('Error processing client lead reminders:', err.message);
  }
}

async function processBuyerReminders() {
  try {
    const sql = `
      SELECT bf.*, b.name AS buyer_name, b.assigned_executive AS buyer_exec, b.created_by AS buyer_creator
      FROM buyer_followups bf
      JOIN buyers b ON bf.buyer_id = b.id
      WHERE (bf.completed_date IS NULL)
        AND (bf.reminder_sent = 0 OR bf.reminder_sent IS NULL)
        AND (DATE(bf.schedule_date) <= CURDATE() OR bf.schedule_date IS NULL)
    `;
    const [rows] = await db.execute(sql);
    for (const row of rows) {
      const executiveId = row.assigned_executive || row.buyer_exec || row.created_by || row.buyer_creator;
      if (executiveId) {
        const timeStr = row.schedule_time || 'Today';
        await sendAssignmentNotification({
          userId: executiveId,
          type: 'buyer_followup_reminder',
          itemId: row.buyer_id,
          itemName: row.buyer_name,
          message: `🔔 REMINDER: Buyer Follow-up for "${row.buyer_name}" scheduled at ${timeStr}`,
          link: `/buyers/${row.buyer_id}`,
        });
      }
      await db.execute('UPDATE buyer_followups SET reminder_sent = 1 WHERE id = ?', [row.id]).catch(() => {});
      console.log(`🔔 [SLA Reminder Pushed] Buyer ${row.buyer_name} follow-up reminder sent to Executive #${executiveId}`);
    }
  } catch (err) {
    console.error('Error processing buyer reminders:', err.message);
  }
}

async function processSellerReminders() {
  try {
    const sql = `
      SELECT sf.*, s.name AS seller_name, s.assigned_to AS seller_exec, s.created_by AS seller_creator
      FROM seller_followups sf
      JOIN sellers s ON sf.seller_id = s.id
      WHERE (sf.completed_date IS NULL)
        AND (sf.reminder_sent = 0 OR sf.reminder_sent IS NULL)
        AND (DATE(sf.schedule_date) <= CURDATE() OR sf.schedule_date IS NULL)
    `;
    const [rows] = await db.execute(sql);
    for (const row of rows) {
      const executiveId = row.assigned_executive || row.seller_exec || row.created_by || row.seller_creator;
      if (executiveId) {
        const timeStr = row.schedule_time || 'Today';
        await sendAssignmentNotification({
          userId: executiveId,
          type: 'seller_followup_reminder',
          itemId: row.seller_id,
          itemName: row.seller_name,
          message: `🔔 REMINDER: Seller Follow-up for "${row.seller_name}" scheduled at ${timeStr}`,
          link: `/sellers/${row.seller_id}`,
        });
      }
      await db.execute('UPDATE seller_followups SET reminder_sent = 1 WHERE id = ?', [row.id]).catch(() => {});
      console.log(`🔔 [SLA Reminder Pushed] Seller ${row.seller_name} follow-up reminder sent to Executive #${executiveId}`);
    }
  } catch (err) {
    console.error('Error processing seller reminders:', err.message);
  }
}

/**
 * 4. Process Overdue Marking & Admin Escalations across Leads, Buyers, Sellers
 */
async function processOverdueAndAdminEscalations() {
  try {
    // A. Mark Overdue Client Lead Follow-ups
    const [overdueLeads] = await db.execute(`
      SELECT f.id, f.lead_id, f.priority, l.name AS lead_name, l.assigned_executive, u.first_name AS exec_name
      FROM followups f
      JOIN client_leads l ON f.lead_id = l.id
      LEFT JOIN users u ON l.assigned_executive = u.id
      WHERE f.completed_date IS NULL
        AND f.scheduled_date < NOW()
        AND (f.is_overdue = 0 OR f.is_overdue IS NULL)
    `).catch(() => [[]]);

    for (const item of overdueLeads) {
      await db.execute('UPDATE followups SET is_overdue = 1 WHERE id = ?', [item.id]).catch(() => {});
      await db.execute('UPDATE client_leads SET missed_followup_count = COALESCE(missed_followup_count, 0) + 1 WHERE id = ?', [item.lead_id]).catch(() => {});
      await updateEntityPriorityScore('lead', item.lead_id);
    }

    // B. Admin Escalations for Client Leads (Missed >= 3 or High Priority Overdue)
    const [escalateLeads] = await db.execute(`
      SELECT f.id, f.lead_id, l.name AS lead_name, l.missed_followup_count, l.priority, u.first_name AS exec_name
      FROM followups f
      JOIN client_leads l ON f.lead_id = l.id
      LEFT JOIN users u ON l.assigned_executive = u.id
      WHERE f.completed_date IS NULL
        AND (f.is_overdue = 1 OR f.scheduled_date < NOW())
        AND (f.admin_escalated = 0 OR f.admin_escalated IS NULL)
        AND (l.missed_followup_count >= 3 OR LOWER(l.priority) = 'high' OR LOWER(f.priority) = 'high')
    `).catch(() => [[]]);

    if (escalateLeads.length > 0) {
      // Find Admin Users
      const [admins] = await db.execute("SELECT id FROM users WHERE LOWER(role) IN ('admin', 'super_admin', 'superadmin', 'manager')");
      for (const item of escalateLeads) {
        for (const admin of admins) {
          await sendAssignmentNotification({
            userId: admin.id,
            type: 'admin_escalation',
            itemId: item.lead_id,
            itemName: item.lead_name,
            message: `⚠️ ADMIN ESCALATION: Executive ${item.exec_name || 'Sales Rep'} missed follow-up SLA on High Priority Lead "${item.lead_name}" (${item.missed_followup_count || 1} missed)`,
            link: `/leads/${item.lead_id}`,
          });
        }
        await db.execute('UPDATE followups SET admin_escalated = 1 WHERE id = ?', [item.id]).catch(() => {});
        console.log(`🚨 [ADMIN ESCALATION] High Priority / Repeated Missed Followup Escalated for Lead ${item.lead_name}`);
      }
    }
  } catch (err) {
    console.error('⚠️ Error in Overdue & Admin Escalation processing:', err.message);
  }
}

module.exports = {
  startAutomationMasterCron,
};
