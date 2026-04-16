
const mysql = require("mysql2");
require("dotenv").config();

// ---------------------------------------------
//  Create a promise-based pool
// ---------------------------------------------
const pool = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    // timezone: "+05:30", // ensures IST even before SET
  })
  .promise();

// ---------------------------------------------
//  Connection event (executed for each new conn)
// ---------------------------------------------
pool.pool.on("connection", (connection) => {
 

 
});

// ---------------------------------------------
//  Error handling (auto reconnect logic)
// ---------------------------------------------
pool.pool.on("error", (err) => {
  console.error("💥 Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.warn("⚠️  Lost DB connection, will reconnect automatically.");
  } else {
    throw err;
  }
});

// ---------------------------------------------
//  Test connection once at startup
// ---------------------------------------------
(async () => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS now_ist");
  } catch (err) {
    console.error("❌ Error testing DB connection:", err);
  }
})();

module.exports = pool;
