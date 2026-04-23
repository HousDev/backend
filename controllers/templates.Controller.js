// const Template = require("../models/template.Model");
// const { submitTemplateToMeta } = require("../integrations/whatsapp");

// exports.getAllTemplates = async (req, res) => {
//   const templates = await Template.findAll();
//   res.json(templates);
// };

// exports.createTemplate = async (req, res) => {
//   const { name, label, category, language, body, variables } = req.body;
//   // Submit to Meta (optional, but we do it)
//   const metaResult = await submitTemplateToMeta({
//     name,
//     category,
//     language,
//     body,
//   });
//   if (!metaResult.success) {
//     return res.status(400).json({ error: metaResult.error });
//   }
//   const id = await Template.create({
//     name,
//     label,
//     category,
//     language,
//     body,
//     variables,
//     status: "pending",
//     meta_id: metaResult.metaId,
//   });
//   res.status(201).json({ id, message: "Template submitted to Meta" });
// };

// exports.updateTemplateStatus = async (req, res) => {
//   const { status, rejection_reason } = req.body;
//   await Template.updateStatus(req.params.id, status, rejection_reason);
//   res.json({ message: "Status updated" });
// };

const Template = require("../models/template.Model");
const { submitTemplateToMeta } = require("../integrations/whatsapp"); // ✅ Import added

// Get all templates
exports.getAllTemplates = async (req, res) => {
  try {
    const templates = await Template.findAll();
    res.json(templates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get template by ID
exports.getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create template
exports.createTemplate = async (req, res) => {
  try {
    const templateData = req.body;

    // Validate required fields
    if (!templateData.name || !templateData.body) {
      return res.status(400).json({ error: "Name and body are required" });
    }

    // ✅ Submit to Meta API (optional - can be commented for now)
    let metaResult = null;
    try {
      metaResult = await submitTemplateToMeta({
        name: templateData.name,
        category: templateData.category,
        language: templateData.language || "en",
        body: templateData.body,
        header_type: templateData.header_type,
        header_text: templateData.header_text,
        footer: templateData.footer,
        buttons: templateData.buttons,
      });
    } catch (metaErr) {
      console.error("Meta submission failed:", metaErr);
      // Continue without Meta submission
    }

    const id = await Template.create({
      ...templateData,
      status: metaResult?.success ? "PENDING" : "PENDING",
      meta_id: metaResult?.success ? metaResult.metaId : null,
    });

    const newTemplate = await Template.findById(id);
    res.status(201).json(newTemplate);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Update template
exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Template.findById(id);

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    const updated = await Template.update(id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete template
exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Template.findById(id);

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await Template.delete(id);
    res.json({ success: true, message: "Template deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Submit template to Meta for review
exports.submitToMeta = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Template.findById(id);

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    // ✅ Call Meta API when manually submitting
    const metaResult = await submitTemplateToMeta({
      name: existing.name,
      category: existing.category,
      language: existing.language,
      body: existing.body,
      header_type: existing.header_type,
      header_text: existing.header_text,
      footer: existing.footer,
      buttons: existing.buttons,
    });

    if (!metaResult.success) {
      return res.status(400).json({ error: metaResult.error });
    }

    const updated = await Template.submitToMeta(id, metaResult.metaId);
    res.json({
      success: true,
      message: "Template submitted for review",
      template: updated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update template status (for webhook or manual update)
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    const existing = await Template.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    const updated = await Template.updateStatus(id, status, rejection_reason);
    res.json({ success: true, template: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};