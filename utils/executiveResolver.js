const db = require("../config/database");

/**
 * Robust dynamic executive resolver for leads, site visits, and client inquiries.
 * Prioritizes active Sales Executive and Pre Sales Executive users.
 * STRICTLY EXCLUDES admin and superadmin users.
 * 
 * Tiers:
 * Tier 1: Existing Parent Entity (seller / owner / property assigned_to if active non-admin)
 * Tier 2: Real Property Locality / Society matching from active properties
 * Tier 3: Least-Loaded Active Executive (fewest active leads in client_leads)
 * Tier 4: Active Executive Fallback
 */
async function resolveDynamicExecutive({ parentType = null, parentId = null, location = null, society = null, propertyId = null } = {}) {
  try {
    const executiveRoleCondition = `
      (
        LOWER(u.role) LIKE '%sales executive%' OR 
        LOWER(u.role) LIKE '%presales executive%' OR 
        LOWER(u.role) LIKE '%pre sales executive%' OR 
        LOWER(u.role) LIKE '%sales%' OR 
        LOWER(u.role) LIKE '%presale%'
      )
      AND LOWER(u.role) NOT LIKE '%admin%'
      AND LOWER(u.role) NOT LIKE '%superadmin%'
      AND LOWER(u.role) NOT IN ('buyer', 'seller', 'owner', 'tenant', 'broker', 'user')
    `;

    // Tier 1a: Check direct property assigned_to
    if (propertyId) {
      const [pRows] = await db.query(
        `SELECT assigned_to FROM my_properties WHERE id = ? AND assigned_to IS NOT NULL
         UNION ALL
         SELECT assigned_to FROM rental_properties WHERE id = ? AND assigned_to IS NOT NULL LIMIT 1`,
        [propertyId, propertyId]
      ).catch(() => [[]]);

      if (pRows && pRows.length > 0 && pRows[0].assigned_to) {
        const [uRows] = await db.query(
          `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role 
           FROM users u 
           WHERE u.id = ? 
             AND (u.is_active = 1 OR u.is_active IS NULL) 
             AND ${executiveRoleCondition}
           LIMIT 1`,
          [pRows[0].assigned_to]
        );
        if (uRows && uRows.length > 0) return uRows[0];
      }
    }

    // Tier 1b: Check parent seller
    if (parentType === "seller" && parentId) {
      const [sRows] = await db.query("SELECT assigned_to FROM sellers WHERE id = ? AND assigned_to IS NOT NULL LIMIT 1", [parentId]);
      if (sRows && sRows.length > 0 && sRows[0].assigned_to) {
        const [uRows] = await db.query(
          `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role 
           FROM users u 
           WHERE u.id = ? 
             AND (u.is_active = 1 OR u.is_active IS NULL) 
             AND ${executiveRoleCondition}
           LIMIT 1`,
          [sRows[0].assigned_to]
        );
        if (uRows && uRows.length > 0) return uRows[0];
      }
    }

    // Tier 1c: Check parent owner
    if (parentType === "owner" && parentId) {
      const [oRows] = await db.query("SELECT assigned_to FROM owners WHERE id = ? AND assigned_to IS NOT NULL LIMIT 1", [parentId]);
      if (oRows && oRows.length > 0 && oRows[0].assigned_to) {
        const [uRows] = await db.query(
          `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role 
           FROM users u 
           WHERE u.id = ? 
             AND (u.is_active = 1 OR u.is_active IS NULL) 
             AND ${executiveRoleCondition}
           LIMIT 1`,
          [oRows[0].assigned_to]
        );
        if (uRows && uRows.length > 0) return uRows[0];
      }
    }

    // Tier 2: Real Property Locality / Society Check
    if (society && String(society).trim().length > 2) {
      const [socExecRows] = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role
         FROM (
           SELECT assigned_to, updated_at FROM my_properties WHERE society_name LIKE ? AND assigned_to IS NOT NULL
           UNION ALL
           SELECT assigned_to, updated_at FROM rental_properties WHERE society_name LIKE ? AND assigned_to IS NOT NULL
         ) t
         JOIN users u ON t.assigned_to = u.id
         WHERE (u.is_active = 1 OR u.is_active IS NULL)
           AND ${executiveRoleCondition}
         ORDER BY t.updated_at DESC LIMIT 1`,
        [`%${society.trim()}%`, `%${society.trim()}%`]
      );
      if (socExecRows && socExecRows.length > 0) return socExecRows[0];
    }

    if (location && String(location).trim().length > 2) {
      const [locExecRows] = await db.query(
        `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role
         FROM (
           SELECT assigned_to, updated_at FROM my_properties WHERE location_name LIKE ? AND assigned_to IS NOT NULL
           UNION ALL
           SELECT assigned_to, updated_at FROM rental_properties WHERE location_name LIKE ? AND assigned_to IS NOT NULL
         ) t
         JOIN users u ON t.assigned_to = u.id
         WHERE (u.is_active = 1 OR u.is_active IS NULL)
           AND ${executiveRoleCondition}
         ORDER BY t.updated_at DESC LIMIT 1`,
        [`%${location.trim()}%`, `%${location.trim()}%`]
      );
      if (locExecRows && locExecRows.length > 0) return locExecRows[0];
    }

    // Tier 3: Least-Loaded Active Executive (Dynamic Workload Balancing)
    const [leastLoaded] = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role,
              COUNT(l.id) AS active_lead_count
       FROM users u
       LEFT JOIN client_leads l ON l.assigned_executive = u.id AND l.status IN ('new', 'in_progress', 'follow_up')
       WHERE (u.is_active = 1 OR u.is_active IS NULL)
         AND ${executiveRoleCondition}
       GROUP BY u.id
       ORDER BY active_lead_count ASC, u.id ASC
       LIMIT 1`
    );
    if (leastLoaded && leastLoaded.length > 0) return leastLoaded[0];

    // Final fallback: first active sales/presales executive (never admin or super admin)
    const [fallbackExec] = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.role 
       FROM users u 
       WHERE (u.is_active = 1 OR u.is_active IS NULL) 
         AND ${executiveRoleCondition}
       ORDER BY u.id ASC 
       LIMIT 1`
    );
    if (fallbackExec && fallbackExec.length > 0) return fallbackExec[0];

    return null;
  } catch (err) {
    console.warn("Dynamic executive resolution warning:", err.message);
    return null;
  }
}

module.exports = {
  resolveDynamicExecutive,
};
