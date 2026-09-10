const FollowUpMaster = require("../models/followUpMaster.Model");

exports.getAllMasterData = async (req, res) => {
  try {
    const data = await FollowUpMaster.getAllMasterData();
    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getAllMasterData:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load master data.",
    });
  }
};

exports.getTableData = async (req, res) => {
  const { table } = req.params;
  try {
    const rows = await FollowUpMaster.findAll(table);
    return res.json({
      success: true,
      table,
      data: rows,
    });
  } catch (error) {
    console.error(`Error in getTableData (${table}):`, error);
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to fetch data for ${table}.`,
    });
  }
};

exports.upsertItem = async (req, res) => {
  const { table } = req.params;
  const itemData = req.body;
  try {
    if (!itemData.id) {
      itemData.id = `${table.replace("fu_", "")}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    await FollowUpMaster.upsert(table, itemData);
    return res.json({
      success: true,
      message: "Record saved successfully.",
      data: itemData,
    });
  } catch (error) {
    console.error(`Error in upsertItem (${table}):`, error);
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to save record in ${table}.`,
    });
  }
};

exports.updateItem = async (req, res) => {
  const { table, id } = req.params;
  const updateData = req.body;
  try {
    await FollowUpMaster.updateById(table, id, updateData);
    return res.json({
      success: true,
      message: "Record updated successfully.",
    });
  } catch (error) {
    console.error(`Error in updateItem (${table}/${id}):`, error);
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to update record in ${table}.`,
    });
  }
};

exports.deleteItem = async (req, res) => {
  const { table, id } = req.params;
  try {
    await FollowUpMaster.deleteById(table, id);
    return res.json({
      success: true,
      message: "Record deleted successfully.",
    });
  } catch (error) {
    console.error(`Error in deleteItem (${table}/${id}):`, error);
    return res.status(500).json({
      success: false,
      message: error.message || `Failed to delete record from ${table}.`,
    });
  }
};

exports.deleteSequence = async (req, res) => {
  const { sequenceName } = req.params;
  try {
    await FollowUpMaster.deleteSequenceByName(sequenceName);
    return res.json({
      success: true,
      message: `Sequence "${sequenceName}" deleted successfully.`,
    });
  } catch (error) {
    console.error(`Error in deleteSequence (${sequenceName}):`, error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete sequence.",
    });
  }
};

exports.importModule = async (req, res) => {
  const { tables } = req.body;
  try {
    if (!tables || typeof tables !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid module backup data provided.",
      });
    }
    const result = await FollowUpMaster.bulkImport(tables);
    return res.json({
      success: true,
      message: `Imported ${result.importedRows} rows across ${result.importedTables} tables.`,
      result,
    });
  } catch (error) {
    console.error("Error in importModule:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to import module data.",
    });
  }
};
