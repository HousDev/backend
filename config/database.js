// const mysql = require("mysql2/promise");
// require("dotenv").config();

// const pool = mysql.createPool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   port: process.env.DB_PORT,
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });

// pool.on("connection", (connection) => {
//   console.log(`New connection established as id ${connection.threadId}`);
//   console.log(`Connected to database: ${connection.config.database}`);
// });

// pool.on("error", (err) => {
//   console.error("Database error:", err);
//   if (err.code === "PROTOCOL_CONNECTION_LOST") {
//     console.log("Reconnecting to database...");
//   } else {
//     throw err;
//   }
// });

// // Function to test connection immediately after pool creation
// async function testConnection() {
//   try {
//     const [rows] = await pool.query("SELECT 1 + 1 AS solution");
//     console.log(
//       "Database connected successfully, test query result:",
//       rows[0].solution
//     );
//   } catch (error) {
//     console.error("Error connecting to database:", error);
//   }
// }

// // Call the test connection function once
// testConnection();

// module.exports = pool;
// config/database.js
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
    timezone: "+05:30", // ensures IST even before SET
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
    console.log("✅ Database connected successfully, current IST time:", rows[0].now_ist);
  } catch (err) {
    console.error("❌ Error testing DB connection:", err);
  }
})();

module.exports = pool;
