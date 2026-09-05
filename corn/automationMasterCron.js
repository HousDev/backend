const cron = require("node-cron");
const db = require("../config/database");

function startAutomationMasterCron() {
  console.log("⏰ Follow-up automation master scheduler started - checking every minute");

  // Run every minute
  cron.schedule("* * * * *", async () => {
    try {
      // Find pending automation jobs whose scheduled_at is past or now
      const [jobs] = await db.query(`
        SELECT * FROM \`fu_automation_jobs\`
        WHERE status IN ('PENDING', 'QUEUED')
          AND (scheduled_at IS NULL OR scheduled_at <= NOW())
        ORDER BY created_at ASC
        LIMIT 20
      `);

      if (!jobs || jobs.length === 0) return;

      for (const job of jobs) {
        try {
          // Mark as SENT (ready for delivery/dispatch)
          await db.query(
            `UPDATE \`fu_automation_jobs\` 
             SET status = 'SENT', sent_at = NOW() 
             WHERE id = ?`,
            [job.id]
          );
          console.log(`[AutomationCron] Processed ${job.channel} job ${job.id} for ${job.entity_code} (${job.entity_ref || 'N/A'})`);
        } catch (jobErr) {
          console.error(`[AutomationCron] Failed to process job ${job.id}:`, jobErr.message);
          await db.query(
            `UPDATE \`fu_automation_jobs\` 
             SET status = 'FAILED', error_message = ? 
             WHERE id = ?`,
            [jobErr.message, job.id]
          );
        }
      }
    } catch (err) {
      // Ignore if table does not exist yet
      if (err && err.code !== 'ER_NO_SUCH_TABLE') {
        console.error("[AutomationCron] error:", err.message);
      }
    }
  });
}

module.exports = { startAutomationMasterCron };
