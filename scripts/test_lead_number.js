// Quick test script to verify lead_number is returned
const db = require('../config/database');

async function test() {
  try {
    const [rows] = await db.execute(
      `SELECT id, lead_number, name FROM client_leads ORDER BY lead_number LIMIT 5`
    );
    console.log('=== lead_number TEST ===');
    rows.forEach(r => {
      console.log(`ID: ${String(r.id).slice(0,6)} | lead_number: ${r.lead_number} | name: ${r.name}`);
    });
    console.log('========================');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

test();
