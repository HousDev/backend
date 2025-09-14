// middleware/slugRedirect.js
const db = require("../config/database");

module.exports = async function slugRedirectMiddleware(req, res, next) {
  try {
    // only care about GET public page pattern maybe; but generic check ok
    const path = req.path; // e.g., /buy/projects/page/35-some-slug
    // extract slug part if path contains '/page/'
    const m = path.match(/\/page\/([^\/]+)/);
    if (!m) return next();

    const slug = m[1];
    const [rows] = await db.execute("SELECT new_slug FROM slug_redirects WHERE old_slug = ? LIMIT 1", [slug]);
    if (rows && rows.length > 0) {
      const newSlug = rows[0].new_slug;
      // preserve query string
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      return res.redirect(301, `/buy/projects/page/${newSlug}${qs}`);
    }
    return next();
  } catch (err) {
    // on DB failure, don't block user; continue to next
    console.warn("slugRedirectMiddleware error:", err && err.message);
    return next();
  }
};
