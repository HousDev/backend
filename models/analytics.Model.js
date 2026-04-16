const db = require("../config/database");

const Analytics = {
  getStats: async () => {
    const [total] = await db.query("SELECT COUNT(*) as total FROM contacts_wa");
    const [newContacts] = await db.query(
      'SELECT COUNT(*) as new FROM contacts_wa WHERE stage = "New"',
    );
    const [convRate] = await db.query(
      'SELECT ROUND((COUNT(CASE WHEN stage = "Closed Won" THEN 1 END)/COUNT(*))*100,2) as rate FROM contacts_wa',
    );
    const [stageDist] = await db.query(
      "SELECT stage, COUNT(*) as count FROM contacts_wa GROUP BY stage",
    );
    const [agentPerf] = await db.query(`
            SELECT assigned_to as agent, COUNT(*) as assigned, 
                SUM(CASE WHEN stage = "Closed Won" THEN 1 ELSE 0 END) as resolved
            FROM contacts_wa GROUP BY assigned_to
        `);
    const [weeklyMsgs] = await db.query(`
            SELECT DATE(time_sent) as date, COUNT(*) as count 
            FROM messages_wa WHERE time_sent >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(time_sent)
        `);
    return {
      totalContacts: total[0].total,
      newContacts: newContacts[0].new,
      conversionRate: convRate[0].rate || 0,
      stageDistribution: stageDist,
      agentPerformance: agentPerf,
      weeklyMessages: weeklyMsgs,
    };
  },
};

module.exports = Analytics;
