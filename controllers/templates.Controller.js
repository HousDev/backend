const Template = require("../models/template.Model");
const { submitTemplateToMeta } = require("../integrations/whatsapp");

exports.getAllTemplates = async (req, res) => {
  const templates = await Template.findAll();
  res.json(templates);
};

exports.createTemplate = async (req, res) => {
  const { name, label, category, language, body, variables } = req.body;
  // Submit to Meta (optional, but we do it)
  const metaResult = await submitTemplateToMeta({
    name,
    category,
    language,
    body,
  });
  if (!metaResult.success) {
    return res.status(400).json({ error: metaResult.error });
  }
  const id = await Template.create({
    name,
    label,
    category,
    language,
    body,
    variables,
    status: "pending",
    meta_id: metaResult.metaId,
  });
  res.status(201).json({ id, message: "Template submitted to Meta" });
};

exports.updateTemplateStatus = async (req, res) => {
  const { status, rejection_reason } = req.body;
  await Template.updateStatus(req.params.id, status, rejection_reason);
  res.json({ message: "Status updated" });
};
