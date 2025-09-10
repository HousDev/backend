const db = require("../config/database");
const ConnectedRemarkModel = require("../models/ConnectedRemarkModel");

const ConnectedRemarkController = {
  create: async (req, res) => {
    try {
      const id = await ConnectedRemarkModel.createRemark(req.body);
      res.status(201).json({ success: true, id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create remark" });
    }
  },

getAll: async (req, res) => {
  try {
    const query = `
      SELECT 
        cr.id,
        cr.tab_id,
        cr.remarks,
        cr.status,
        cr.created_at,
        cr.type1,
        cr.type2,
        cr.value1,
        cr.value2,
        mt1.name AS type1Name,
        mt2.name AS type2Name,
        mv1.value AS value1Name,
        mv2.value AS value2Name
      FROM connected_remarks cr
      LEFT JOIN master_types mt1 ON cr.type1 = mt1.id
      LEFT JOIN master_types mt2 ON cr.type2 = mt2.id
      LEFT JOIN master_values mv1 ON cr.value1 = mv1.id
      LEFT JOIN master_values mv2 ON cr.value2 = mv2.id
    `;

    const [data] = await db.execute(query); // or db.query() depending on your setup
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch remarks" });
  }
},


  getById: async (req, res) => {
    try {
      const remark = await ConnectedRemarkModel.getRemarkById(req.params.id);
      res.json(remark);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch remark" });
    }
  },

  update: async (req, res) => {
    try {
      const updated = await ConnectedRemarkModel.updateRemark(req.params.id, req.body);
      res.json({ updated });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update remark" });
    }
  },

  delete: async (req, res) => {
    try {
      const deleted = await ConnectedRemarkModel.deleteRemark(req.params.id);
      res.json({ deleted });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete remark" });
    }
  },
  getByTabId: async (req, res) => {
  try {
    const tabId = req.params.tabId;
    const query = `
      SELECT 
        cr.id,
        cr.tab_id,
        cr.remarks,
        cr.status,
        cr.created_at,
        cr.type1,
        cr.type2,
        cr.value1,
        cr.value2,
        mt1.name AS type1Name,
        mt2.name AS type2Name,
        mv1.value AS value1Name,
        mv2.value AS value2Name
      FROM connected_remarks cr
      LEFT JOIN master_types mt1 ON cr.type1 = mt1.id
      LEFT JOIN master_types mt2 ON cr.type2 = mt2.id
      LEFT JOIN master_values mv1 ON cr.value1 = mv1.id
      LEFT JOIN master_values mv2 ON cr.value2 = mv2.id
      WHERE cr.tab_id = ?
    `;

    const [data] = await db.execute(query, [tabId]);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch remarks by tab_id" });
  }
},

};

module.exports = ConnectedRemarkController;
