// const MasterModel = require("../models/masterModel");
// const csv = require("csv-parser");
// const fs = require("fs");

// const MasterController = {
//   // Master Types
//   getAllMasterTypes: async (req, res) => {
//     try {
//       const { tabId } = req.params;
//       const masterTypes = await MasterModel.getAllMasterTypes(tabId);

//       // Get values count for each master type
//       const masterTypesWithCount = await Promise.all(
//         masterTypes.map(async (type) => {
//           const values = await MasterModel.getValuesByMasterType(type.id);
//           return {
//             ...type,
//             valuesCount: values.length,
//           };
//         })
//       );

//       res.json(masterTypesWithCount);
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   getMasterType: async (req, res) => {
//     try {
//       const { id } = req.params;
//       const masterType = await MasterModel.getMasterTypeById(id);

//       if (!masterType) {
//         return res.status(404).json({ error: "Master type not found" });
//       }

//       const values = await MasterModel.getValuesByMasterType(id);
//       res.json({ ...masterType, values });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   createMasterType: async (req, res) => {
//     try {
//       const { tabId, name, status } = req.body;
//       await MasterModel.createMasterType(tabId, name, status);
//       res.status(201).json({ message: "Master type created successfully" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   updateMasterType: async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { name, status } = req.body;

//       const affectedRows = await MasterModel.updateMasterType(id, name, status);
//       if (affectedRows === 0) {
//         return res.status(404).json({ error: "Master type not found" });
//       }

//       res.json({ message: "Master type updated successfully" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   deleteMasterType: async (req, res) => {
//     try {
//       const { id } = req.params;
//       const affectedRows = await MasterModel.deleteMasterType(id);

//       if (affectedRows === 0) {
//         return res.status(404).json({ error: "Master type not found" });
//       }

//       res.json({ message: "Master type deleted successfully" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // Master Values
//   getMasterValues: async (req, res) => {
//     try {
//       const { masterTypeId } = req.params;
//       const values = await MasterModel.getValuesByMasterType(masterTypeId);
//       res.json(values);
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // controllers/masterController.js
// createMasterValue: async (req, res) => {
//   try {
//     const { masterTypeId } = req.params;
//     const { value, status } = req.body;

//     const valueId = await MasterModel.createMasterValue(
//       masterTypeId,
//       value,
//       status || 'Active'
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Value created successfully',
//       data: { id: valueId }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// },

//   updateMasterValue: async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { value, status } = req.body;

//       const affectedRows = await MasterModel.updateMasterValue(
//         id,
//         value,
//         status
//       );
//       if (affectedRows === 0) {
//         return res.status(404).json({ error: "Master value not found" });
//       }

//       res.json({ message: "Master value updated successfully" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   deleteMasterValue: async (req, res) => {
//     try {
//       const { id } = req.params;
//       const affectedRows = await MasterModel.deleteMasterValue(id);

//       if (affectedRows === 0) {
//         return res.status(404).json({ error: "Master value not found" });
//       }

//       res.json({ message: "Master value deleted successfully" });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // Import/Export
//   exportMasterTypes: async (req, res) => {
//     try {
//       const { tabId } = req.params;
//       const masterTypes = await MasterModel.getAllMasterTypes(tabId);

//       let csv = "Name,Status\n";
//       masterTypes.forEach((type) => {
//         csv += `${type.name},${type.status}\n`;
//       });

//       res.header("Content-Type", "text/csv");
//       res.attachment(`${tabId}_master_types.csv`);
//       res.send(csv);
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // importMasterTypes: async (req, res) => {
//   //   try {
//   //     const { tabId } = req.params;

//   //     if (!req.file) {
//   //       return res.status(400).json({ error: "No file uploaded" });
//   //     }

//   //     const results = [];
//   //     fs.createReadStream(req.file.path)
//   //       .pipe(csv())
//   //       .on("data", (data) => results.push(data))
//   //       .on("end", async () => {
//   //         try {
//   //           await MasterModel.importMasterTypes(tabId, results);
//   //           fs.unlinkSync(req.file.path); // Delete the temp file
//   //           res.json({
//   //             message: `${results.length} master types imported successfully`,
//   //           });
//   //         } catch (error) {
//   //           fs.unlinkSync(req.file.path); // Delete the temp file
//   //           res.status(500).json({ error: error.message });
//   //         }
//   //       });
//   //   } catch (error) {
//   //     res.status(500).json({ error: error.message });
//   //   }
//   // },

// importMasterTypes: async (req, res) => {
//   try {
//     const { tabId } = req.params;

//     if (!req.file) {
//       return res.status(400).json({ error: "No file uploaded" });
//     }

//     const results = [];
//     fs.createReadStream(req.file.path)
//       .pipe(csv({
//         mapHeaders: ({ header }) => header.trim().toLowerCase() // 👈 normalize headers
//       }))
//       .on("data", (data) => results.push(data))
//       .on("end", async () => {
//         try {
//           await MasterModel.importMasterTypes(tabId, results);
//           fs.unlinkSync(req.file.path); // Delete the temp file
//           res.json({
//             message: `${results.length} master types imported successfully`,
//           });
//         } catch (error) {
//           fs.unlinkSync(req.file.path);
//           res.status(500).json({ error: error.message });
//         }
//       });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// },

//   exportMasterValues: async (req, res) => {
//     try {
//       const { masterTypeId } = req.params;
//       const masterType = await MasterModel.getMasterTypeById(masterTypeId);
//       const values = await MasterModel.getValuesByMasterType(masterTypeId);

//       if (!masterType) {
//         return res.status(404).json({ error: "Master type not found" });
//       }

//       let csv = "Value,Status\n";
//       values.forEach((value) => {
//         csv += `${value.value},${value.status}\n`;
//       });

//       res.header("Content-Type", "text/csv");
//       res.attachment(`${masterType.name}_values.csv`);
//       res.send(csv);
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   },

//   // importMasterValues: async (req, res) => {
//   //   try {
//   //     const { masterTypeId } = req.params;

//   //     if (!req.file) {
//   //       return res.status(400).json({ error: "No file uploaded" });
//   //     }

//   //     const results = [];
//   //     fs.createReadStream(req.file.path)
//   //       .pipe(csv())
//   //       .on("data", (data) => results.push(data))
//   //       .on("end", async () => {
//   //         try {
//   //           await MasterModel.importMasterValues(masterTypeId, results);
//   //           fs.unlinkSync(req.file.path); // Delete the temp file
//   //           res.json({
//   //             message: `${results.length} values imported successfully`,
//   //           });
//   //         } catch (error) {
//   //           fs.unlinkSync(req.file.path); // Delete the temp file
//   //           res.status(500).json({ error: error.message });
//   //         }
//   //       });
//   //   } catch (error) {
//   //     res.status(500).json({ error: error.message });
//   //   }
//   // },

//   importMasterValues: async (req, res) => {
//   try {
//     const { masterTypeId } = req.params;

//     if (!req.file) {
//       return res.status(400).json({ error: "No file uploaded" });
//     }

//     const results = [];
//     fs.createReadStream(req.file.path)
//       .pipe(csv({
//         mapHeaders: ({ header }) => header.trim().toLowerCase() // 👈 normalize headers
//       }))
//       .on("data", (data) => results.push(data))
//       .on("end", async () => {
//         try {
//           await MasterModel.importMasterValues(masterTypeId, results);
//           fs.unlinkSync(req.file.path); // Delete the temp file
//           res.json({
//             message: `${results.length} values imported successfully`,
//           });
//         } catch (error) {
//           fs.unlinkSync(req.file.path);
//           res.status(500).json({ error: error.message });
//         }
//       });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// },
// };

// module.exports = MasterController;

const MasterModel = require("../models/masterModel");
const csv = require("csv-parser");
const fs = require("fs");

const MasterController = {
  // ==================== MASTER TYPES ====================

  getAllMasterTypes: async (req, res) => {
    try {
      const { tabId } = req.params;
      const masterTypes = await MasterModel.getAllMasterTypes(tabId);

      const masterTypesWithCount = await Promise.all(
        masterTypes.map(async (type) => {
          const values = await MasterModel.getValuesByMasterType(type.id);
          return {
            ...type,
            valuesCount: values.length,
          };
        }),
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

  // 🔥 UPDATED: Create Master Type with duplicate check
  createMasterType: async (req, res) => {
    try {
      const { tabId, name, status } = req.body;

      // Check for duplicate
      const existing = await MasterModel.checkDuplicateMasterType(tabId, name);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Master type "${name}" already exists in this tab!`,
        });
      }

      const id = await MasterModel.createMasterType(tabId, name, status);
      res.status(201).json({
        success: true,
        message: "Master type created successfully",
        id,
        name,
        status,
      });
    } catch (error) {
      // Handle database duplicate error
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          error: `Master type "${req.body.name}" already exists!`,
        });
      }
      res.status(500).json({ error: error.message });
    }
  },

  // 🔥 UPDATED: Update Master Type with duplicate check
  updateMasterType: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, status } = req.body;

      const existingType = await MasterModel.getMasterTypeById(id);
      if (!existingType) {
        return res.status(404).json({ error: "Master type not found" });
      }

      // Check for duplicate excluding current
      const duplicate = await MasterModel.checkDuplicateMasterType(
        existingType.tab_id,
        name,
        id,
      );
      if (duplicate) {
        return res.status(409).json({
          error: `Master type "${name}" already exists in this tab!`,
        });
      }

      const affectedRows = await MasterModel.updateMasterType(id, name, status);
      if (affectedRows === 0) {
        return res.status(404).json({ error: "Master type not found" });
      }

      res.json({
        success: true,
        message: "Master type updated successfully",
      });
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

      res.json({
        success: true,
        message: "Master type deleted successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ==================== MASTER VALUES ====================

  getMasterValues: async (req, res) => {
    try {
      const { masterTypeId } = req.params;
      const values = await MasterModel.getValuesByMasterType(masterTypeId);
      res.json(values);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // 🔥 UPDATED: Create Master Value with duplicate check
  createMasterValue: async (req, res) => {
    try {
      const { masterTypeId } = req.params;
      const { value, status } = req.body;

      // Check for duplicate
      const existing = await MasterModel.checkDuplicateMasterValue(
        masterTypeId,
        value,
      );
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Value "${value}" already exists in this master type!`,
        });
      }

      const valueId = await MasterModel.createMasterValue(
        masterTypeId,
        value,
        status || "Active",
      );

      res.status(201).json({
        success: true,
        message: "Value created successfully",
        data: { id: valueId, value, status },
      });
    } catch (error) {
      // Handle database duplicate error
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          error: `Value "${req.body.value}" already exists!`,
        });
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // 🔥 UPDATED: Update Master Value with duplicate check
  updateMasterValue: async (req, res) => {
    try {
      const { id } = req.params;
      const { value, status } = req.body;

      const existingValue = await MasterModel.getMasterValueById(id);
      if (!existingValue) {
        return res.status(404).json({ error: "Master value not found" });
      }

      // Check for duplicate excluding current
      const duplicate = await MasterModel.checkDuplicateMasterValue(
        existingValue.master_type_id,
        value,
        id,
      );
      if (duplicate) {
        return res.status(409).json({
          error: `Value "${value}" already exists in this master type!`,
        });
      }

      const affectedRows = await MasterModel.updateMasterValue(
        id,
        value,
        status,
      );
      if (affectedRows === 0) {
        return res.status(404).json({ error: "Master value not found" });
      }

      res.json({
        success: true,
        message: "Master value updated successfully",
      });
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

      res.json({
        success: true,
        message: "Master value deleted successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ==================== IMPORT / EXPORT ====================

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

  // 🔥 UPDATED: Import Master Types with duplicate filtering
  importMasterTypes: async (req, res) => {
    try {
      const { tabId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const results = [];
      fs.createReadStream(req.file.path)
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.trim().toLowerCase(),
          }),
        )
        .on("data", (data) => results.push(data))
        .on("end", async () => {
          try {
            // Filter out duplicates
            const uniqueResults = [];
            const existingNames = new Set();
            let duplicateCount = 0;

            for (const item of results) {
              const existing = await MasterModel.checkDuplicateMasterType(
                tabId,
                item.name,
              );
              if (!existing && !existingNames.has(item.name.toLowerCase())) {
                existingNames.add(item.name.toLowerCase());
                uniqueResults.push(item);
              } else {
                duplicateCount++;
              }
            }

            if (uniqueResults.length === 0) {
              fs.unlinkSync(req.file.path);
              return res.json({
                success: true,
                message: `No new master types to import (${duplicateCount} duplicates skipped)`,
                imported: 0,
                skipped: duplicateCount,
              });
            }

            await MasterModel.importMasterTypes(tabId, uniqueResults);
            fs.unlinkSync(req.file.path);
            res.json({
              success: true,
              message: `${uniqueResults.length} master types imported successfully (${duplicateCount} duplicates skipped)`,
              imported: uniqueResults.length,
              skipped: duplicateCount,
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

  // 🔥 UPDATED: Import Master Values with duplicate filtering
  importMasterValues: async (req, res) => {
    try {
      const { masterTypeId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const results = [];
      fs.createReadStream(req.file.path)
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.trim().toLowerCase(),
          }),
        )
        .on("data", (data) => results.push(data))
        .on("end", async () => {
          try {
            // Filter out duplicates
            const uniqueResults = [];
            const existingValues = new Set();
            let duplicateCount = 0;

            for (const item of results) {
              const existing = await MasterModel.checkDuplicateMasterValue(
                masterTypeId,
                item.value,
              );
              if (!existing && !existingValues.has(item.value.toLowerCase())) {
                existingValues.add(item.value.toLowerCase());
                uniqueResults.push(item);
              } else {
                duplicateCount++;
              }
            }

            if (uniqueResults.length === 0) {
              fs.unlinkSync(req.file.path);
              return res.json({
                success: true,
                message: `No new values to import (${duplicateCount} duplicates skipped)`,
                imported: 0,
                skipped: duplicateCount,
              });
            }

            await MasterModel.importMasterValues(masterTypeId, uniqueResults);
            fs.unlinkSync(req.file.path);
            res.json({
              success: true,
              message: `${uniqueResults.length} values imported successfully (${duplicateCount} duplicates skipped)`,
              imported: uniqueResults.length,
              skipped: duplicateCount,
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