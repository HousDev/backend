const MasterModel = require("../models/masterModel");
const csv = require("csv-parser");
const fs = require("fs");

const MasterController = {
  // Master Types
  getAllMasterTypes: async (req, res) => {
    try {
      const { tabId } = req.params;
      const masterTypes = await MasterModel.getAllMasterTypes(tabId);

      // Get values count for each master type
      const masterTypesWithCount = await Promise.all(
        masterTypes.map(async (type) => {
          const values = await MasterModel.getValuesByMasterType(type.id);
          return {
            ...type,
            valuesCount: values.length,
          };
        })
      );

      res.json(masterTypesWithCount);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getMasterType: async (req, res) => {
    try {
      const { id } = req.params;
      const masterType = await MasterModel.getMasterTypeById(id);

      if (!masterType) {
        return res.status(404).json({ error: "Master type not found" });
      }

      const values = await MasterModel.getValuesByMasterType(id);
      res.json({ ...masterType, values });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createMasterType: async (req, res) => {
    try {
      const { tabId, name, status } = req.body;
      await MasterModel.createMasterType(tabId, name, status);
      res.status(201).json({ message: "Master type created successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  updateMasterType: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, status } = req.body;

      const affectedRows = await MasterModel.updateMasterType(id, name, status);
      if (affectedRows === 0) {
        return res.status(404).json({ error: "Master type not found" });
      }

      res.json({ message: "Master type updated successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  deleteMasterType: async (req, res) => {
    try {
      const { id } = req.params;
      const affectedRows = await MasterModel.deleteMasterType(id);

      if (affectedRows === 0) {
        return res.status(404).json({ error: "Master type not found" });
      }

      res.json({ message: "Master type deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Master Values
  getMasterValues: async (req, res) => {
    try {
      const { masterTypeId } = req.params;
      const values = await MasterModel.getValuesByMasterType(masterTypeId);
      res.json(values);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // controllers/masterController.js
createMasterValue: async (req, res) => {
  try {
    const { masterTypeId } = req.params;
    const { value, status } = req.body;

    const valueId = await MasterModel.createMasterValue(
      masterTypeId,
      value,
      status || 'Active'
    );

    res.status(201).json({
      success: true,
      message: 'Value created successfully',
      data: { id: valueId }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
},

  updateMasterValue: async (req, res) => {
    try {
      const { id } = req.params;
      const { value, status } = req.body;

      const affectedRows = await MasterModel.updateMasterValue(
        id,
        value,
        status
      );
      if (affectedRows === 0) {
        return res.status(404).json({ error: "Master value not found" });
      }

      res.json({ message: "Master value updated successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  deleteMasterValue: async (req, res) => {
    try {
      const { id } = req.params;
      const affectedRows = await MasterModel.deleteMasterValue(id);

      if (affectedRows === 0) {
        return res.status(404).json({ error: "Master value not found" });
      }

      res.json({ message: "Master value deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Import/Export
  exportMasterTypes: async (req, res) => {
    try {
      const { tabId } = req.params;
      const masterTypes = await MasterModel.getAllMasterTypes(tabId);

      let csv = "Name,Status\n";
      masterTypes.forEach((type) => {
        csv += `${type.name},${type.status}\n`;
      });

      res.header("Content-Type", "text/csv");
      res.attachment(`${tabId}_master_types.csv`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // importMasterTypes: async (req, res) => {
  //   try {
  //     const { tabId } = req.params;

  //     if (!req.file) {
  //       return res.status(400).json({ error: "No file uploaded" });
  //     }

  //     const results = [];
  //     fs.createReadStream(req.file.path)
  //       .pipe(csv())
  //       .on("data", (data) => results.push(data))
  //       .on("end", async () => {
  //         try {
  //           await MasterModel.importMasterTypes(tabId, results);
  //           fs.unlinkSync(req.file.path); // Delete the temp file
  //           res.json({
  //             message: `${results.length} master types imported successfully`,
  //           });
  //         } catch (error) {
  //           fs.unlinkSync(req.file.path); // Delete the temp file
  //           res.status(500).json({ error: error.message });
  //         }
  //       });
  //   } catch (error) {
  //     res.status(500).json({ error: error.message });
  //   }
  // },

importMasterTypes: async (req, res) => {
  try {
    const { tabId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim().toLowerCase() // 👈 normalize headers
      }))
      .on("data", (data) => results.push(data))
      .on("end", async () => {
        try {
          await MasterModel.importMasterTypes(tabId, results);
          fs.unlinkSync(req.file.path); // Delete the temp file
          res.json({
            message: `${results.length} master types imported successfully`,
          });
        } catch (error) {
          fs.unlinkSync(req.file.path);
          res.status(500).json({ error: error.message });
        }
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
},

  exportMasterValues: async (req, res) => {
    try {
      const { masterTypeId } = req.params;
      const masterType = await MasterModel.getMasterTypeById(masterTypeId);
      const values = await MasterModel.getValuesByMasterType(masterTypeId);

      if (!masterType) {
        return res.status(404).json({ error: "Master type not found" });
      }

      let csv = "Value,Status\n";
      values.forEach((value) => {
        csv += `${value.value},${value.status}\n`;
      });

      res.header("Content-Type", "text/csv");
      res.attachment(`${masterType.name}_values.csv`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // importMasterValues: async (req, res) => {
  //   try {
  //     const { masterTypeId } = req.params;

  //     if (!req.file) {
  //       return res.status(400).json({ error: "No file uploaded" });
  //     }

  //     const results = [];
  //     fs.createReadStream(req.file.path)
  //       .pipe(csv())
  //       .on("data", (data) => results.push(data))
  //       .on("end", async () => {
  //         try {
  //           await MasterModel.importMasterValues(masterTypeId, results);
  //           fs.unlinkSync(req.file.path); // Delete the temp file
  //           res.json({
  //             message: `${results.length} values imported successfully`,
  //           });
  //         } catch (error) {
  //           fs.unlinkSync(req.file.path); // Delete the temp file
  //           res.status(500).json({ error: error.message });
  //         }
  //       });
  //   } catch (error) {
  //     res.status(500).json({ error: error.message });
  //   }
  // },

  importMasterValues: async (req, res) => {
  try {
    const { masterTypeId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim().toLowerCase() // 👈 normalize headers
      }))
      .on("data", (data) => results.push(data))
      .on("end", async () => {
        try {
          await MasterModel.importMasterValues(masterTypeId, results);
          fs.unlinkSync(req.file.path); // Delete the temp file
          res.json({
            message: `${results.length} values imported successfully`,
          });
        } catch (error) {
          fs.unlinkSync(req.file.path);
          res.status(500).json({ error: error.message });
        }
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
},
};

module.exports = MasterController;
