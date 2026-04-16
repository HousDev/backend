const cron = require("node-cron");
const Broadcast = require("../models/broadcast.Model");
const Template = require("../models/template.Model");
const Contact = require("../models/contact.Model");
const Message = require("../models/message.Model");
const { sendTemplateMessage } = require("../integrations/whatsapp");

let jobs = {};

async function processBroadcast(broadcastId) {
  const broadcast = (await Broadcast.findAll()).find(
    (b) => b.id == broadcastId,
  );
  if (!broadcast) return;
  await Broadcast.updateStatus(broadcastId, "processing");
  let segmentQuery = "";
  if (broadcast.segment === "Hot Leads") segmentQuery = 'WHERE tag = "hot"';
  else if (broadcast.segment === "Qualified")
    segmentQuery = 'WHERE stage = "Qualified"';
  else if (broadcast.segment === "New") segmentQuery = 'WHERE stage = "New"';
  const contacts = await Contact.findAll(); // we need custom query but for simplicity, filter later
  const template = (await Template.findAll()).find(
    (t) => t.id == broadcast.template_id,
  );
  if (!template) return;
  let sent = 0;
  for (const contact of contacts) {
    if (
      broadcast.segment !== "All Contacts" &&
      !segmentQuery.includes(contact.tag) &&
      !segmentQuery.includes(contact.stage)
    )
      continue;
    const msgId = await sendTemplateMessage(
      contact.phone,
      template.name,
      template.language,
    );
    await Message.create({
      contact_id: contact.id,
      direction: "out",
      text: template.body.replace(/{{1}}/g, contact.name),
      whatsapp_msg_id: msgId,
    });
    sent++;
  }
  await Broadcast.updateStatus(broadcastId, "completed", sent);
}

function scheduleBroadcast(id, date, time) {
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");
  const cronExpr = `${minute} ${hour} ${day} ${month} *`;
  const job = cron.schedule(cronExpr, () => processBroadcast(id));
  jobs[id] = job;
}

async function initScheduler() {
  const broadcasts = await Broadcast.getPendingScheduled();
  for (const bc of broadcasts) {
    scheduleBroadcast(bc.id, bc.scheduled_date, bc.scheduled_time);
  }
}

module.exports = { scheduleBroadcast, initScheduler };
