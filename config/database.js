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

const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
    waitForConnections: true, 
  connectionLimit: 10,
  queueLimit: 0,
});

// Har nayi connection par session timezone IST set karo
pool.on("connection", (connection) => {
  console.log(`New connection established as id ${connection.threadId}`);
  console.log(`Connected to database: ${connection.config.database}`);

  // IMPORTANT: yaha callback-API connection aata hai -> promise() lagao
  connection
    .promise()
    .query("SET time_zone = '+05:30'")
    // Agar tz tables load kiye hain to ye bhi chalega:
    // .query("SET time_zone = 'Asia/Kolkata'")
    .then(() => {
      console.log("Timezone set to IST (+05:30) for this connection");
    })
    .catch((err) => {
      console.error("Failed to set timezone for connection:", err);
    });
});

pool.on("error", (err) => {
  console.error("Database error:", err);
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.log("Reconnecting to database...");
  } else {
    throw err;
  }
});

// Function to test connection immediately after pool creation
async function testConnection() {
  try {
    // Alias ko reserved keyword se bachao (backticks ya new name)
    const [rows] = await pool.query("SELECT NOW() AS `now_ist`");
    console.log("Database connected successfully, current IST time:", rows[0].now_ist);
  } catch (error) {
    console.error("Error connecting to database:", error);
  }
}

// Call the test connection function once
testConnection();

module.exports = pool;

