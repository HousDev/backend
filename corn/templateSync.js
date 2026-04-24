const cron = require("node-cron");
const Template = require("../models/template.Model");
const { getTemplateStatus } = require("../integrations/whatsapp");

async function syncTemplates() {
  try {
    console.log("🔄 [CRON] Checking template status...");

    // ✅ Only check templates that are actually under review
    const pendingTemplates = await Template.findByStatus([
      "PENDING",
      "IN_APPEAL",
    ]);
      
    for (const template of pendingTemplates) {
      if (!template.meta_id) {
        console.log(`⚠️ Skipping ${template.name} (no meta_id)`);
        continue;
      }

      try {
        const metaRes = await getTemplateStatus(template.meta_id);

        if (!metaRes) continue;

        const newStatus = metaRes.status;
        const oldStatus = template.status;

        // ✅ Update only if status changed
        if (newStatus && newStatus !== oldStatus) {
          await Template.updateStatus(
            template.id,
            newStatus,
            metaRes.rejection_reason || null,
            template.meta_id,
          );

          console.log(`✅ ${template.name}: ${oldStatus} → ${newStatus}`);
        }
      } catch (err) {
        console.error(`❌ Failed to sync ${template.name}:`, err.message);
      }
    }

    console.log("✅ [CRON] Sync completed\n");
  } catch (err) {
    console.error("❌ CRON ERROR:", err.message);
  }
}

// ⏰ Run every 2 minutes
cron.schedule("*/2 * * * *", syncTemplates);

module.exports = syncTemplates;
