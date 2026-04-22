// const Contact = require("../models/contact.Model");

// exports.getAllContacts = async (req, res) => {
//   const contacts = await Contact.findAll();
//   res.json(contacts);
// };

// exports.getContactById = async (req, res) => {
//   const contact = await Contact.getWithMessages(req.params.id);
//   if (!contact) return res.status(404).json({ error: "Not found" });
//   res.json(contact);
// };

// exports.createContact = async (req, res) => {
//   const id = await Contact.create(req.body);
//   await Contact.initPipeline(id);
//   res.status(201).json({ id });
// };

// exports.updateContact = async (req, res) => {
//   await Contact.update(req.params.id, req.body);
//   res.json({ message: "Updated" });
// };

// exports.deleteContact = async (req, res) => {
//   await Contact.delete(req.params.id);
//   res.json({ message: "Deleted" });
// };

// exports.addNote = async (req, res) => {
//   const { contact_id, note } = req.body;
//   await Contact.addNote(contact_id, note);
//   res.status(201).json({ message: "Note added" });
// };

// exports.updatePipeline = async (req, res) => {
//   const { contact_id, stage_name, done, completed_date } = req.body;
//   await Contact.updatePipeline(contact_id, stage_name, done, completed_date);
//   res.json({ message: "Pipeline updated" });
// };
const Contact = require("../models/contact.Model");

exports.getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.findAll();
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getContactById = async (req, res) => {
  try {
    const contact = await Contact.getWithMessages(req.params.id);
    if (!contact) return res.status(404).json({ error: "Not found" });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createContact = async (req, res) => {
  try {
    const id = await Contact.create(req.body);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateContact = async (req, res) => {
  try {
    await Contact.update(req.params.id, req.body);
    const updated = await Contact.findById(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteContact = async (req, res) => {
  try {
    await Contact.delete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addNote = async (req, res) => {
  try {
    const { contact_id, note } = req.body;
    const noteId = await Contact.addNote(contact_id, note);
    res.status(201).json({ id: noteId, message: "Note added" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};