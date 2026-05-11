const cron = require("node-cron");
const db = require("../config/database");

cron.schedule("*/30 * * * *", async () => {
  try {
    await db.query(`
      UPDATE chatbot_conversations
      SET status = 'completed'
      WHERE status = 'active'
      AND started_at < NOW() - INTERVAL 30 MINUTE
    `);

    console.log("✅ Old conversations cleaned");
  } catch (err) {
    console.error(err);
  }
});
