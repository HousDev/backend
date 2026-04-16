const Broadcast = require("../models/broadcast.Model");
const { scheduleBroadcast } = require("../services/broadcastScheduler");

exports.getAllBroadcasts = async (req, res) => {
  const broadcasts = await Broadcast.findAll();
  res.json(broadcasts);
};



exports.createBroadcast = async (req, res) => {
  const { name, template_id, segment, scheduled_date, scheduled_time } =
    req.body;
  const id = await Broadcast.create({
    name,
    template_id,
    segment,
    scheduled_date,
    scheduled_time,
    status: "scheduled",
  });
  scheduleBroadcast(id, scheduled_date, scheduled_time);
  res.status(201).json({ id });
};
