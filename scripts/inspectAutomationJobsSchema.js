const db = require("../config/database");
(async () => {
  try {
    const [rows] = await db.query(
      "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'fu_automation_jobs' ORDER BY ORDINAL_POSITION",
    );
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
