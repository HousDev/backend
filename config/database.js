// module.exports = pool;
const mysql = require("mysql2/promise"); // Promise wrapper for mysql2

require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "resale_expert_crm",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // You can enable these if you want
  // acquireTimeout: 60000,
  // timeout: 60000,
  // reconnect: true
});

// Logs when a new connection is made
pool.on("connection", (connection) => {
  console.log(`New connection established as id ${connection.threadId}`);
  console.log(`Connected to database: ${connection.config.database}`);
});

// Handle pool errors
pool.on("error", (err) => {
  console.error("Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.log("Reconnecting to database...");
    // Here you might want to add some reconnection logic if needed
  } else {
    throw err; // Let the app crash or handle globally
  }
});

module.exports = pool;
