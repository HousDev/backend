const RSSSourceModel = require("../models/rssSourceModel");
const BlogPostModel = require("../models/BlogPost");
const { fetchAndFilter } = require("../utils/rssFetcher");
const Parser = require("rss-parser");
const parser = new Parser();

/* ---------------- helpers ---------------- */
function parseIdOr400(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return null;
  }
  return id;
}

/* ---------------- CRUD ---------------- */
const list = async (_req, res) => {
  try {
    const rows = await RSSSourceModel.list();
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const id = parseIdOr400(req, res);
    if (id == null) return;
    const one = await RSSSourceModel.getById(id);
    if (!one)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: one });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const create = async (req, res) => {
  try {
    if (req.body.url && !/^https?:\/\//i.test(req.body.url)) {
      req.body.url = `https://${req.body.url}`;
    }
    const created = await RSSSourceModel.create(req.body);
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const id = parseIdOr400(req, res);
    if (id == null) return;
    if (req.body.url && !/^https?:\/\//i.test(req.body.url)) {
      req.body.url = `https://${req.body.url}`;
    }
    const updated = await RSSSourceModel.update(id, req.body);
    if (!updated)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const toggle = async (req, res) => {
  try {
    const id = parseIdOr400(req, res);
    if (id == null) return;
    const updated = await RSSSourceModel.toggleActive(id);
    if (!updated)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const remove = async (req, res) => {
  try {
    const id = parseIdOr400(req, res);
    if (id == null) return;
    const exists = await RSSSourceModel.getById(id);
    if (!exists)
      return res.status(404).json({ success: false, message: "Not found" });
    await RSSSourceModel.remove(id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

/* ---------------- Scan / Import logic ---------------- */
// SCAN ONE (no DB insert)  -> update newPosts & lastSync
const scanOne = async (req, res) => {
  try {
    const id = parseIdOr400(req, res);
    if (id == null) return;

    const src = await RSSSourceModel.getById(id);
    if (!src)
      return res.status(404).json({ success: false, message: "Not found" });
    if (!src.active)
      return res
        .status(400)
        .json({ success: false, message: "Source is inactive" });

    const { fetched, items } = await fetchAndFilter(src);

    // Count items that WOULD be inserted (dryRun)
    let newCount = 0;
    const previews = [];
    for (const item of items) {
      const out = await BlogPostModel.insertFromRSS({
        item,
        source: src,
        dryRun: true, // 👈 do not insert
        asDraft: true,
      });
      if (out?.wouldInsert) {
        newCount++;
        previews.push(out.preview);
      }
    }

    await RSSSourceModel.setScanCounts(id, { newCount }); // new_posts = newCount, last_sync = now

    const latest = await RSSSourceModel.getById(id);
    res.json({
      success: true,
      data: latest,
      meta: { fetched, newCount, previews },
    });
  } catch (e) {
    const msg = String(e.message || e);
    const isParse =
      /Feed not recognized|Invalid feed URL|HTTP \d+ while fetching feed/i.test(
        msg
      );
    return res
      .status(isParse ? 422 : 400)
      .json({ success: false, message: msg });
  }
};

// IMPORT ONE (click → insert as drafts) -> consume newPosts
const importOne = async (req, res) => {
  try {
    const id = parseIdOr400(req, res);
    if (id == null) return;

    const src = await RSSSourceModel.getById(id);
    if (!src)
      return res.status(404).json({ success: false, message: "Not found" });
    if (!src.active)
      return res
        .status(400)
        .json({ success: false, message: "Source is inactive" });

    const { fetched, items } = await fetchAndFilter(src);

    let inserted = 0;
    for (const item of items) {
      const out = await BlogPostModel.insertFromRSS({
        item,
        source: src,
        dryRun: false,
        asDraft: true, // 👈 ALWAYS draft on import click
        autoPublish: false,
      });
      if (out.inserted) inserted++;
    }

    await RSSSourceModel.bumpAfterImport(id, { insertedCount: inserted }); // total_posts += inserted, new_posts = GREATEST(new_posts - inserted, 0), last_sync = now
    await RSSSourceModel.logSync(id, {
      fetchedCount: fetched,
      insertedCount: inserted,
    });

    const latest = await RSSSourceModel.getById(id);
    res.json({
      success: true,
      data: latest,
      meta: { fetched, inserted },
      message: `${inserted} articles imported as drafts`,
    });
  } catch (e) {
    const msg = String(e.message || e);
    const isParse =
      /Feed not recognized|Invalid feed URL|HTTP \d+ while fetching feed/i.test(
        msg
      );
    return res
      .status(isParse ? 422 : 400)
      .json({ success: false, message: msg });
  }
};

// SCAN ALL (no insert)
const syncAll = async (_req, res) => {
  try {
    const list = await RSSSourceModel.list();
    const active = list.filter((s) => s.active);
    const results = [];

    for (const src of active) {
      try {
        const { fetched, items } = await fetchAndFilter(src);
        let newCount = 0;
        for (const item of items) {
          const out = await BlogPostModel.insertFromRSS({
            item,
            source: src,
            dryRun: true,
            asDraft: true,
          });
          if (out?.wouldInsert) newCount++;
        }
        await RSSSourceModel.setScanCounts(src.id, { newCount });
        const latest = await RSSSourceModel.getById(src.id);
        results.push({ id: src.id, fetched, newCount, source: latest });
      } catch (err) {
        await RSSSourceModel.logSync(src.id, {
          fetchedCount: 0,
          insertedCount: 0,
          errorText: err.message,
        });
        results.push({ id: src.id, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

/* ---------------- Optional utilities ---------------- */
const validate = async (req, res) => {
  try {
    let { url } = req.query;
    if (!url)
      return res
        .status(400)
        .json({ success: false, message: "url is required" });
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    await parser.parseURL(url);
    res.json({ success: true, valid: true });
  } catch (e) {
    res.status(200).json({ success: true, valid: false, message: e.message });
  }
};

const proxy = async (req, res) => {
  try {
    let { url, limit } = req.query;
    if (!url)
      return res
        .status(400)
        .json({ success: false, message: "url is required" });
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const feed = await parser.parseURL(url);
    const items = Array.isArray(feed.items)
      ? feed.items.slice(0, Number(limit) || 10)
      : [];
    res.json({ success: true, items });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  toggle,
  remove,
  // new flow
  scanOne,
  importOne,
  syncAll, // scan all
  // utilities
  validate,
  proxy,
};
