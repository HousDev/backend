const db = require("./config/database");
(async () => {
  const tables = [
    { table: "followups", col: "reminder_sent" },
    { table: "buyer_followups", col: "reminder_sent" },
    { table: "seller_followups", col: "reminder_sent" },
  ];

  for (const item of tables) {
    try {
      const [rows] = await db.execute(
        `SHOW COLUMNS FROM ${item.table} LIKE '${item.col}'`,
      );
      console.log(`${item.table}.${item.col}: exists=${rows.length}`);
    } catch (e) {
      console.log(`${item.table}.${item.col}: error=${e.message}`);
    }
  }

  try {
    const [rows] = await db.execute(
      "SHOW CREATE TABLE client_lead_notification",
    );
    console.log(
      "client_lead_notification schema create:",
      rows[0]["Create Table"],
    );
  } catch (e) {
    console.log("client_lead_notification schema error:", e.message);
  }
})();
