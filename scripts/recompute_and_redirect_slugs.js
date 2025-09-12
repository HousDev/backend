// scripts/recompute_and_redirect_slugs.js
const db = require("../config/database"); // mysql2/promise pool
const { slugifyTextParts } = require("../utils/slugify");

async function fetchAllProperties(batchSize = 500, offset = 0) {
  const bs = Number(batchSize) || 500;
  const sql = `SELECT id, property_type_name, unit_type, property_subtype_name, city_name, slug FROM my_properties ORDER BY id ASC LIMIT ${bs} OFFSET ${offset}`;
  const [rows] = await db.execute(sql);
  return rows;
}

async function upsertRedirect(oldSlug, newSlug, propertyId) {
  // insert ignore if exists
  const sql = `
    INSERT INTO slug_redirects (old_slug, new_slug, property_id)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE new_slug = VALUES(new_slug)
  `;
  await db.execute(sql, [oldSlug, newSlug, propertyId]);
}

async function updatePropertySlug(id, newSlug) {
  await db.execute("UPDATE my_properties SET slug = ? WHERE id = ?", [newSlug, id]);
}

async function runBatch(batchSize = 500) {
  let offset = 0;
  let totalChanged = 0;
  while (true) {
    const rows = await fetchAllProperties(batchSize, offset);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const { id, property_type_name, unit_type, property_subtype_name, city_name, slug: oldSlug } = row;
      const titlePart = slugifyTextParts(property_type_name, unit_type, property_subtype_name, city_name);
      const newSlug = `${id}-${titlePart}`;

      if (!oldSlug || oldSlug.trim() === "") {
        // if empty, just set
        try {
          await updatePropertySlug(id, newSlug);
          console.log(`Set slug for id=${id} -> ${newSlug}`);
          totalChanged++;
        } catch (e) {
          console.error("Failed setting slug:", id, e && e.message);
        }
        continue;
      }

      if (oldSlug !== newSlug) {
        try {
          // store redirect from old -> new
          await upsertRedirect(oldSlug, newSlug, id);
          // update property
          await updatePropertySlug(id, newSlug);
          console.log(`Updated id=${id} : ${oldSlug} -> ${newSlug}`);
          totalChanged++;
        } catch (e) {
          console.error("Error updating id=", id, e && e.message);
        }
      } else {
        // no change
      }
    }

    offset += rows.length;
    // tiny delay
    await new Promise(r => setTimeout(r, 30));
  }

  console.log("Done. totalChanged:", totalChanged);
  process.exit(0);
}

runBatch().catch(err => {
  console.error("Fatal:", err && err.stack ? err.stack : err);
  process.exit(1);
});
