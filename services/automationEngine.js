const Rule = require("../models/rule.Model");
const Template = require("../models/template.Model");
const Contact = require("../models/contact.Model");
const Message = require("../models/message.Model");
const { sendTemplateMessage } = require("../integrations/whatsapp");

async function triggerAutomation(contactId, messageText) {
  const rules = await Rule.findAll();
  for (const rule of rules) {
    if (!rule.is_active) continue;
    let triggered = false;
    if (rule.trigger_event === "new_contact_first_message") {
      const messages = await Message.findByContact(contactId);
      if (messages.length === 1) triggered = true;
    } else if (rule.trigger_event === "new_contact_any_message") {
      triggered = true;
    } else if (rule.trigger_event === "message_contains_keyword") {
      const params =
        typeof rule.action_params === "string"
          ? JSON.parse(rule.action_params)
          : rule.action_params;
      if (messageText.toLowerCase().includes(params.keyword?.toLowerCase()))
        triggered = true;
    }
    if (triggered) {
  const params =
    typeof rule.action_params === "string"
      ? JSON.parse(rule.action_params)
      : rule.action_params;
      if (rule.action_type === "send_template") {
        const template = await Template.findApproved(params.template_name);
        if (template) {
          const contact = await Contact.findById(contactId);
          const msgId = await sendTemplateMessage(
            contact.phone,
            template.name,
            template.language,
          );
          await Message.create({
            contact_id: contactId,
            direction: "bot",
            text: template.body.replace(/{{1}}/g, contact.name),
            whatsapp_msg_id: msgId,
          });
        }
      } else if (rule.action_type === "assign_agent") {
        await Contact.update(contactId, { assigned_to: params.agent });
      }
      await Rule.incrementExecCount(rule.id);
    }
  }
}

module.exports = { triggerAutomation };
