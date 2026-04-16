const Rule = require("../models/rule.Model");

exports.getAllRules = async (req, res) => {
  const rules = await Rule.findAll();
  res.json(rules);
};

exports.updateRule = async (req, res) => {
  await Rule.updateActive(req.params.id, req.body.is_active);
  res.json({ message: "Rule updated" });
};
