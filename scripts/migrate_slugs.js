// scripts/migrate_slugs.js
// Usage:
//   DRY_RUN=1 node scripts/migrate_slugs.js   -> show changes, do NOT write
//   node scripts/migrate_slugs.js            -> perform updates
const db = require("../config/database"); // mysql2/promise pool
const { slugifyTextParts } = require("../utils/slugify");

const DRY_RUN = !!process.env.DRY_RUN;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;

function clampBatchSize(n) {
  const bs = Number(n) || 500;
  return Math.max(1, Math.min(5000, Math.floor(bs)));
}

async function fetchBatch(startId = 0, batchSize = 500) {
  const safeBs = clampBatchSize(batchSize);

  // We page by id to avoid skipping/duplicates if rows change during migration
  // This selects rows with id > startId ordered by id, limit batchSize
  const sql = `
    SELECT id,
           property_type_name,
           unit_type,
           property_subtype_name,
           location_name,
           city_name,
           slug
    FROM my_properties
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ${safeBs}
  `;
  const [rows] = await db.execute(sql, [startId]);
  return rows;
}

async function updateSlug(id, slug) {
  if (DRY_RUN) return 1;
  const [r] = await db.execute("UPDATE my_properties SET slug = ? WHERE id = ?", [slug, id]);
  return r.affectedRows;
}

async function findBySlug(slug) {
  const [rows] = await db.execute("SELECT id FROM my_properties WHERE slug = ? LIMIT 1", [slug]);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function run() {
  console.log("Starting slug migration (will update existing slugs if different)");
  console.log("DRY_RUN =", DRY_RUN ? "true" : "false");
  console.log("BATCH_SIZE =", BATCH_SIZE);

  let totalUpdated = 0;
  let lastId = 0;
  while (true) {
    const rows = await fetchBatch(lastId, BATCH_SIZE);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const {
        id,
        property_type_name,
        unit_type,
        property_subtype_name,
        location_name,
        city_name,
        slug: currentSlugRaw,
      } = row;

      lastId = Math.max(lastId, id);

      const currentSlug = (currentSlugRaw || "").toString();

      // Build slug using the new signature: slugifyTextParts(id, propertyType, unitType, propertySubtype, location, city)
      const titlePart = slugifyTextParts(
        id,
        property_type_name || "",
        unit_type || "",
        property_subtype_name || "",
        location_name || "",
        city_name || ""
      );

      let candidate = titlePart;
      if (!candidate.startsWith(String(id))) {
        candidate = `${id}-${candidate}`;
      }

      // Skip if identical
      if (currentSlug === candidate) {
        continue;
      }

      // If another row already has candidate slug, append -id to make unique
      let finalSlug = candidate;
      const conflicting = await findBySlug(finalSlug);
      if (conflicting && conflicting.id !== id) {
        finalSlug = `${candidate}-${id}`;
      }

      try {
        const updated = await updateSlug(id, finalSlug);
        if (updated) {
          console.log(`id=${id}: "${currentSlug}" -> "${finalSlug}"${DRY_RUN ? " (dry-run)" : ""}`);
          totalUpdated++;
        } else {
          console.warn(`id=${id}: update not applied (affectedRows=0)`);
        }
      } catch (err) {
        console.error(`id=${id}: Failed to update slug: ${err && err.message}`);
      }
    }

    // gentle pause between batches
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log("Migration finished. Total updated:", totalUpdated);
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration error:", err && err.stack ? err.stack : err);
  process.exit(1);
});
