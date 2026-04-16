const Contact = require("../models/contact.Model");

exports.getAllContacts = async (req, res) => {
  const contacts = await Contact.findAll();
  res.json(contacts);
};

exports.getContactById = async (req, res) => {
  const contact = await Contact.getWithMessages(req.params.id);
  if (!contact) return res.status(404).json({ error: "Not found" });
  res.json(contact);
};

exports.createContact = async (req, res) => {
  const id = await Contact.create(req.body);
  await Contact.initPipeline(id);
  res.status(201).json({ id });
};

exports.updateContact = async (req, res) => {
  await Contact.update(req.params.id, req.body);
  res.json({ message: "Updated" });
};

exports.deleteContact = async (req, res) => {
  await Contact.delete(req.params.id);
  res.json({ message: "Deleted" });
};

exports.addNote = async (req, res) => {
  const { contact_id, note } = req.body;
  await Contact.addNote(contact_id, note);
  res.status(201).json({ message: "Note added" });
};

exports.updatePipeline = async (req, res) => {
  const { contact_id, stage_name, done, completed_date } = req.body;
  await Contact.updatePipeline(contact_id, stage_name, done, completed_date);
  res.json({ message: "Pipeline updated" });
};
