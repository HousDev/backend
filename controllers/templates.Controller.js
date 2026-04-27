const Template = require("../models/template.Model");
const db = require("../config/database");
const {
  submitTemplateToMeta,
  getTemplateStatus,
  fetchMetaTemplates,
} = require("../integrations/whatsapp");

// Get all templates
exports.getAllTemplates = async (req, res) => {
  try {
    const templates = await Template.findAll();
    res.json(templates);
  } catch (err) {
    console.error("Error in getAllTemplates:", err);
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
    console.error("Error in getTemplateById:", err);
    res.status(500).json({ error: err.message });
  }
};

// Create template
exports.createTemplate = async (req, res) => {
  try {
    const templateData = req.body;

    if (!templateData.name || !templateData.body) {
      return res.status(400).json({ error: "Name and body are required" });
    }

    const id = await Template.create(templateData);
    const newTemplate = await Template.findById(id);
    res.status(201).json(newTemplate);
  } catch (err) {
    console.error("Error in createTemplate:", err);
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

    // Don't allow editing approved templates
    if (existing.status === "APPROVED") {
      return res
        .status(400)
        .json({ error: "Approved templates cannot be edited" });
    }

    const updated = await Template.update(id, req.body);
    res.json(updated);
  } catch (err) {
    console.error("Error in updateTemplate:", err);
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
    console.error("Error in deleteTemplate:", err);
    res.status(500).json({ error: err.message });
  }
};

// Submit template to Meta
// exports.submitToMeta = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const template = await Template.findById(id);

//     if (!template) {
//       return res.status(404).json({ error: "Template not found" });
//     }

//     // Don't resubmit approved templates
//     if (template.status === "APPROVED") {
//       return res.status(400).json({ error: "Template is already approved" });
//     }

//     // Build payload for Meta API
//     const components = [];

//     // BODY
//     components.push({
//       type: "BODY",
//       text: template.body,
//     });

//     // HEADER (TEXT only)
//     if (template.header_type === "TEXT" && template.header_text) {
//       components.push({
//         type: "HEADER",
//         format: "TEXT",
//         text: template.header_text,
//       });
//     }

//     // FOOTER
//     if (template.footer) {
//       components.push({
//         type: "FOOTER",
//         text: template.footer,
//       });
//     }

//     // BUTTONS
//     if (template.buttons && template.buttons.length > 0) {
//       components.push({
//         type: "BUTTONS",
//         buttons: template.buttons.map((btn) => ({
//           type: "QUICK_REPLY",
//           text: btn.text,
//         })),
//       });
//     }

//     // 🔥 EXAMPLE (MOST IMPORTANT)
//     const example = {};

//     if (template.variables && template.variables.length > 0) {
//       example.body_text = [template.variables];
//     }

//     if (
//       template.header_type === "TEXT" &&
//       template.header_text &&
//       template.header_text.includes("{{")
//     ) {
//       example.header_text = [template.variables.slice(0, 1)];
//     }

//     // FINAL PAYLOAD
//     const payload = {
//       name: template.name.toLowerCase().replace(/\s+/g, "_"),
//       category: template.category,
//       language: template.language,
//       components,
//       example,
//     };

//     const result = await submitTemplateToMeta(payload);

//     if (!result.success) {
//       return res.status(400).json({ error: result.error });
//     }

//     const updated = await Template.updateStatus(
//       id,
//       "PENDING",
//       null,
//       result.metaId,
//     );
//     res.json({
//       success: true,
//       message: "Template submitted for review",
//       template: updated,
//     });
//   } catch (err) {
//     console.error("Submit to Meta error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

exports.submitToMeta = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);
    console.log(template);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    if (template.status === "APPROVED") {
      return res.status(400).json({ error: "Template is already approved" });
    }

    // ------------------------
    // 🔧 HELPER
    // ------------------------
    function extractVariables(text) {
      if (!text) return [];
      const matches = text.match(/\{\{(\d+)\}\}/g) || [];
      return [
        ...new Set(matches.map((m) => parseInt(m.replace(/\D/g, "")))),
      ].sort((a, b) => a - b);
    }

    // ------------------------
    // 🔧 COMPONENTS
    // ------------------------
    const components = [];

    // BODY
    components.push({
      type: "BODY",
      text: template.body,
    });

    // HEADER TEXT
    if (template.header_type === "TEXT" && template.header_text) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: template.header_text,
      });
    }

    // HEADER IMAGE / MEDIA
    if (template.header_type === "IMAGE" && template.header_media_url) {
      components.push({
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: [template.header_media_url], // ⚠️ ideally uploaded handle
        },
      });
    }

    // FOOTER
    if (template.footer) {
      components.push({
        type: "FOOTER",
        text: template.footer,
      });
    }

    // BUTTONS (FIXED)
    if (template.buttons && template.buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: template.buttons.map((btn) => {
          if (btn.type === "URL") {
            return {
              type: "URL",
              text: btn.text,
              url: btn.url,
            };
          }

          return {
            type: "QUICK_REPLY",
            text: btn.text,
          };
        }),
      });
    }

    // ------------------------
    // 🔥 EXAMPLE (CRITICAL)
    // ------------------------
    const example = {};

    const bodyVars = extractVariables(template.body);

    if (bodyVars.length > 0 && template.variables) {
      example.body_text = [
        bodyVars.map((n) => template.variables[n - 1] || ""),
      ];
    }

    // 🔧 Format text (IMPORTANT)
    const formattedText = template.body
      .replace(/\r\n/g, "\n") // windows support
      .replace(/\n/g, "\\n"); // Meta format

    // ✅ FINAL PAYLOAD
    const payload = {
      name: template.name.toLowerCase().replace(/\s+/g, "_"),
      category: template.category,
      language: template.language || "en_US",
      components: [
        {
          type: "BODY",
          text: formattedText, // 🔥 FIXED (NOT template.body)

          ...(template.variables &&
            template.variables.length > 0 && {
              example: {
                body_text: [template.variables], // correct format
              },
            }),
        },
      ],
    };
    console.log(payload);

    console.log("📤 META PAYLOAD:", JSON.stringify(payload, null, 2));

    const result = await submitTemplateToMeta(payload);
    console.log("meta res : ", result);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const updated = await Template.updateStatus(
      id,
      "PENDING",
      null,
      result.metaId,
    );

    res.json({
      success: true,
      message: "Template submitted for review",
      template: updated,
    });
  } catch (err) {
    console.error("❌ Submit to Meta error:", err);
    res.status(500).json({ error: err.message });
  }
};

// exports.syncFromMeta = async (req, res) => {
//   try {
//     const metaTemplates = await fetchMetaTemplates();

//     for (const mt of metaTemplates) {
//       // ✅ extract body
//       const bodyComponent = mt.components?.find((c) => c.type === "BODY");
//       const bodyText = bodyComponent?.text || "";

//       // ✅ check existing
//       const existing = await Template.findByMetaId(mt.id, mt.name);

//       if (!existing) {
//         // 🔥 CREATE
//         await Template.create({
//           name: mt.name,
//           label: mt.name,
//           category: mt.category,
//           language: mt.language,
//           body: bodyText,
//           status: mt.status,
//           meta_id: mt.id,
//         });
//       } else {
//         // 🔄 UPDATE
//         await Template.update(existing.id, {
//           status: mt.status,
//           body: bodyText,
//         });
//       }
//     }

//     res.json({
//       success: true,
//       message: "Meta templates synced successfully",
//     });
//   } catch (err) {
//     console.error("❌ Sync From Meta Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

exports.syncFromMeta = async (req, res) => {
  try {
    const metaTemplates = await fetchMetaTemplates();
    // console.log(metaTemplates);
    const metaIds = metaTemplates.map((t) => t.id); // ✅ STEP 1
    // console.log("ids", metaIds);
    // -----------------------------
    // ✅ CREATE / UPDATE LOOP
    // -----------------------------
    for (const mt of metaTemplates) {
      try {
        // console.log(mt);
        const bodyComponent = mt.components?.find((c) => c.type === "BODY");
        const bodyText = bodyComponent?.text || "";

        const existing = await Template.findByMetaId(mt.id);
        // console.log(existing);
        if (!existing) {
          await Template.create({
            name: mt.name,
            label: mt.name,
            category: mt.category,
            language: mt.language,
            body: bodyText,
            status: mt.status,
            meta_id: mt.id,
          });
        }
        // else {
        //   await Template.update(existing.id, {
        //     status: mt.status,
        //     body: bodyText,
        //     is_deleted: 0, // 🔥 restore if was deleted
        //   });
        // }
      } catch (err) {
        console.log("⚠️ Skip:", mt.name, err.code);
        continue;
      }
    }
    const placeholders = metaIds.map(() => "?").join(",");
    // -----------------------------
    // ❌ DELETE SYNC (IMPORTANT)
    // -----------------------------
    await db.query(
      `
      DELETE FROM templates_wa
      WHERE meta_id IS NOT NULL
      AND meta_id NOT IN (${placeholders})
    `,
      metaIds,
    );

    res.json({
      success: true,
      message: "Sync completed (create/update/delete)",
    });
  } catch (err) {
    console.error("❌ Sync Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Sync template status from Meta
exports.syncMetaStatus = async (req, res) => {
  try {
    // Get all templates that are not approved (pending, draft, rejected, in_appeal)
    const pending = await Template.findPending();
    const updates = [];

    for (const template of pending) {
      // If no meta_id, try to find by name
      let metaId = template.meta_id;

      if (!metaId) {
        // You might want to search by name here
        console.log(`Template ${template.name} has no meta_id, skipping sync`);
        continue;
      }

      try {
        const status = await getTemplateStatus(metaId);
        // ✅ YAHI PE LOG LAGAO
        // console.log({
        //   template: template.name,
        //   dbStatus: template.status,
        //   metaStatus: status?.status,
        //   metaId: metaId,
        // });

        if (status && status.status !== template.status) {
          await Template.updateStatus(
            template.id,
            status.status,
            status.rejection_reason || null,
            metaId,
          );
          updates.push({
            id: template.id,
            name: template.name,
            oldStatus: template.status,
            newStatus: status.status,
          });
        }
      } catch (err) {
        console.error(`Failed to sync template ${template.name}:`, err.message);
        // Continue with next template
        continue;
      }
    }

    const allTemplates = await Template.findAll();
    res.json({
      success: true,
      updated: updates.length,
      templates: allTemplates,
      updates: updates,
    });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: err.message });
  }
};
