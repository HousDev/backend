const Analytics = require("../models/analytics.Model");

exports.getStats = async (req, res) => {
  const stats = await Analytics.getStats();
  res.json(stats);
};
