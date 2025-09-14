// // scripts/update_slugs.js
// const db = require("../config/database");

// async function updateSlugs() {
//   try {
//     console.log("Starting slug update...");

//     const [rows] = await db.query("SELECT id, title FROM properties WHERE slug IS NULL OR slug = ''");

//     let updatedCount = 0;
//     for (const row of rows) {
//       const slug = row.title
//         .toLowerCase()
//         .replace(/\s+/g, "-")   // spaces → hyphen
//         .replace(/[^\w\-]+/g, ""); // special chars hatao

//       await db.query("UPDATE properties SET slug = ? WHERE id = ?", [slug, row.id]);
//       updatedCount++;
//     }

//     console.log(`Migration complete. Total updated: ${updatedCount}`);
//     process.exit(0);
//   } catch (err) {
//     console.error("Error in slug update:", err);
//     process.exit(1);
//   }
// }

// updateSlugs();
