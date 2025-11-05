const ContactModel = require("../models/contactModel");

// allowed statuses - keep in sync with frontend
const ALLOWED_STATUSES = ["new", "replied", "in-progress", "resolved"];

const ContactController = {
  async submitContact(req, res) {
    try {
      const { name, email, phone, subject, message, propertyType, budget } =
        req.body;

      if (!name || !email || !phone || !subject || !message) {
        return res
          .status(400)
          .json({ ok: false, error: "Missing required fields" });
      }

      // simple email check (you already had)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ ok: false, error: "Invalid email" });
      }

      const { insertId } = await ContactModel.createContact({
        name,
        email,
        phone,
        subject,
        message,
        propertyType,
        budget,
      });

      return res
        .status(201)
        .json({ ok: true, id: insertId, message: "Contact submitted" });
    } catch (err) {
      console.error("submitContact error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  },

  async getContacts(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 1000);
      const offset = parseInt(req.query.offset || "0", 10);

      const rows = await ContactModel.listContacts({ limit, offset });
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error("getContacts error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  },

  async getContactById(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

      const contact = await ContactModel.getContactById(id);
      if (!contact)
        return res.status(404).json({ ok: false, error: "Not found" });

      return res.json({ ok: true, data: contact });
    } catch (err) {
      console.error("getContactById error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  },

  // PATCH /api/contact/:id/status
  async updateStatus(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });
      if (!status || !ALLOWED_STATUSES.includes(status)) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid status value" });
      }

      const updated = await ContactModel.updateContactById(id, {
        status,
        updated_at: new Date(),
      });

      if (!updated)
        return res.status(404).json({ ok: false, error: "Not found" });
      return res.json({ ok: true, data: updated });
    } catch (err) {
      console.error("updateStatus error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  },

  // POST /api/contact/:id/reply
  async addReply(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { message, sender = "Agent" } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });
      if (!message || !message.trim())
        return res.status(400).json({ ok: false, error: "Empty reply" });

      // append reply using model function (uses JSON append)
      const reply = {
        id: Date.now(),
        sender,
        message: message.trim(),
        timestamp: new Date(),
      };

      const updated = await ContactModel.appendReplyToContact(id, reply);
      if (!updated)
        return res.status(404).json({ ok: false, error: "Not found" });

      // also set status to 'replied' (business rule)
      await ContactModel.updateContactById(id, {
        status: "replied",
        updated_at: new Date(),
      });

      return res.json({ ok: true, data: updated });
    } catch (err) {
      console.error("addReply error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  },

  // PUT /api/contact/:id  (generic update)
  async updateContact(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const patch = req.body;
      if (!id) return res.status(400).json({ ok: false, error: "Invalid id" });

      // optionally sanitize patch to allowed fields only
      const allowed = [
        "status",
        "assignedTo",
        "assigned_to",
        "isStarred",
        "is_starred",
        "updated_at",
      ];
      const updateObj = {};

      // map common frontend names to DB column names
      if (
        patch.hasOwnProperty("status") &&
        ALLOWED_STATUSES.includes(patch.status)
      ) {
        updateObj.status = patch.status;
      }
      if (
        patch.hasOwnProperty("assignedTo") ||
        patch.hasOwnProperty("assigned_to")
      ) {
        updateObj.assigned_to = patch.assignedTo ?? patch.assigned_to ?? null;
      }
      if (
        patch.hasOwnProperty("isStarred") ||
        patch.hasOwnProperty("is_starred")
      ) {
        updateObj.is_starred = patch.isStarred ? 1 : patch.is_starred ? 1 : 0;
      }
      if (patch.hasOwnProperty("updated_at")) {
        updateObj.updated_at = patch.updated_at;
      } else {
        updateObj.updated_at = new Date();
      }

      if (Object.keys(updateObj).length === 0) {
        return res
          .status(400)
          .json({ ok: false, error: "Nothing to update or invalid fields" });
      }

      const updated = await ContactModel.updateContactById(id, updateObj);
      if (!updated)
        return res.status(404).json({ ok: false, error: "Not found" });

      return res.json({ ok: true, data: updated });
    } catch (err) {
      console.error("updateContact error:", err);
      return res
        .status(500)
        .json({ ok: false, error: "Internal server error" });
    }
  },
};

module.exports = ContactController;
