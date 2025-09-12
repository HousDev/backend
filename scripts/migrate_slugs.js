// scripts/migrate_slugs.js
// Usage: node scripts/migrate_slugs.js
const db = require("../config/database"); // your mysql2/promise pool
const { slugifyTextParts } = require("../utils/slugify");

async function fetchAllPropertiesWithoutSlug(batchSize = 500) {
  const bs = Number(batchSize) || 500;
  const safeBs = Math.max(1, Math.min(5000, Math.floor(bs))); // clamp 1..5000

  const sql = `SELECT id, property_type_name, unit_type, property_subtype_name, city_name, slug
               FROM my_properties
               WHERE slug IS NULL OR slug = ''
               LIMIT ${safeBs}`;
  // Using db.execute (mysql2/promise)
  const [rows] = await db.execute(sql);
  return rows;
}

async function updateSlug(id, slug) {
  const [r] = await db.execute("UPDATE my_properties SET slug = ? WHERE id = ?", [slug, id]);
  return r.affectedRows;
}

async function slugExists(slug) {
  const [rows] = await db.execute("SELECT id FROM my_properties WHERE slug = ? LIMIT 1", [slug]);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function run() {
  console.log("Starting slug migration...");
  let totalUpdated = 0;
  while (true) {
    const rows = await fetchAllPropertiesWithoutSlug(500);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const { id, property_type_name, unit_type, property_subtype_name, city_name } = row;
      const titlePart = slugifyTextParts(property_type_name, unit_type, property_subtype_name, city_name);
      const slugCandidate = `${id}-${titlePart}`;

      // ensure unique-ish (id prefix normally enough)
      let finalSlug = slugCandidate;
      let counter = 1;
      while (true) {
        const existing = await slugExists(finalSlug);
        if (!existing) break;
        if (existing.id === id) break; // same row — fine
        finalSlug = `${slugCandidate}-${counter++}`;
      }

      try {
        const updated = await updateSlug(id, finalSlug);
        if (updated) {
          console.log(`Updated id=${id} -> slug=${finalSlug}`);
          totalUpdated++;
        } else {
          console.warn(`No update performed for id=${id}`);
        }
      } catch (err) {
        console.error(`Failed to update slug for id=${id}: ${err && err.message}`);
      }
    }

    // small pause to relieve DB if many rows
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log("Migration complete. Total updated:", totalUpdated);
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration error:", err && err.stack ? err.stack : err);
  process.exit(1);
});
