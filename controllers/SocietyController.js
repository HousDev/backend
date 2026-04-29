// const db = require("../config/database");
// const SocietyModel = require("../models/SocietyModel");
// const { v4: uuidv4 } = require("uuid");
// const XLSX = require("xlsx");

// const SocietyController = {
//   // Create new society
//   create: async (req, res) => {
//     try {
//       const { societyName, locality, city, pincode, status } = req.body;

//       if (!societyName || !locality || !city || !pincode) {
//         return res.status(400).json({
//           error:
//             "Missing required fields: societyName, locality, city, pincode",
//         });
//       }

//       const pincodeRegex = /^[1-9][0-9]{5}$/;
//       if (!pincodeRegex.test(pincode)) {
//         return res.status(400).json({
//           error:
//             "Invalid pincode format. Must be a valid 6-digit Indian pincode",
//         });
//       }

//       const id = await SocietyModel.createSociety({
//         societyName,
//         locality,
//         city,
//         pincode,
//         status: status || "Active",
//       });

//       res.status(201).json({
//         success: true,
//         message: "Society created successfully",
//         id,
//       });
//     } catch (err) {
//       console.error("Error creating society:", err);
//       res.status(500).json({ error: "Failed to create society" });
//     }
//   },

//   // Get all societies
//   getAll: async (req, res) => {
//     try {
//       const { search, pincode, city } = req.query;

//       let societies;
//       if (search) {
//         societies = await SocietyModel.searchSocieties(search);
//       } else if (pincode) {
//         societies = await SocietyModel.getSocietiesByPincode(pincode);
//       } else if (city) {
//         societies = await SocietyModel.getSocietiesByCity(city);
//       } else {
//         societies = await SocietyModel.getAllSocieties();
//       }

//       const formattedSocieties = societies.map((society) => ({
//         id: society.id,
//         societyName: society.society_name,
//         locality: society.locality,
//         city: society.city,
//         pincode: society.pincode,
//         status: society.status,
//         createdAt: society.created_at,
//       }));

//       res.json(formattedSocieties);
//     } catch (err) {
//       console.error("Error fetching societies:", err);
//       res.status(500).json({ error: "Failed to fetch societies" });
//     }
//   },

//   // Get society by ID
//   getById: async (req, res) => {
//     try {
//       const society = await SocietyModel.getSocietyById(req.params.id);

//       if (!society) {
//         return res.status(404).json({ error: "Society not found" });
//       }

//       const formattedSociety = {
//         id: society.id,
//         societyName: society.society_name,
//         locality: society.locality,
//         city: society.city,
//         pincode: society.pincode,
//         status: society.status,
//         createdAt: society.created_at,
//       };

//       res.json(formattedSociety);
//     } catch (err) {
//       console.error("Error fetching society:", err);
//       res.status(500).json({ error: "Failed to fetch society" });
//     }
//   },

//   // Get society by ID or Name
//   getSocietyByIdentifier: async (req, res) => {
//     try {
//       const { identifier } = req.params;

//       if (!identifier) {
//         return res.status(400).json({ error: "Identifier is required" });
//       }

//       let society = await SocietyModel.getSocietyById(identifier);

//       if (!society) {
//         const allSocieties = await SocietyModel.getAllSocieties();
//         society = allSocieties.find((s) =>
//           s.society_name.toLowerCase().includes(identifier.toLowerCase()),
//         );
//       }

//       if (!society) {
//         return res.status(404).json({ error: "Society not found" });
//       }

//       const formattedSociety = {
//         id: society.id,
//         societyName: society.society_name,
//         society_name: society.society_name,
//         locality: society.locality,
//         city: society.city,
//         pincode: society.pincode,
//         status: society.status,
//         created_at: society.created_at,
//       };

//       res.json(formattedSociety);
//     } catch (err) {
//       console.error("Error fetching society by identifier:", err);
//       res.status(500).json({ error: "Failed to fetch society" });
//     }
//   },

//   // Update society
//   update: async (req, res) => {
//     try {
//       const { societyName, locality, city, pincode, status } = req.body;

//       const existingSociety = await SocietyModel.getSocietyById(req.params.id);
//       if (!existingSociety) {
//         return res.status(404).json({ error: "Society not found" });
//       }

//       if (pincode) {
//         const pincodeRegex = /^[1-9][0-9]{5}$/;
//         if (!pincodeRegex.test(pincode)) {
//           return res.status(400).json({
//             error:
//               "Invalid pincode format. Must be a valid 6-digit Indian pincode",
//           });
//         }
//       }

//       const updated = await SocietyModel.updateSociety(req.params.id, {
//         societyName,
//         locality,
//         city,
//         pincode,
//         status,
//       });

//       if (updated === 0) {
//         return res.status(404).json({ error: "Society not found" });
//       }

//       res.json({
//         success: true,
//         message: "Society updated successfully",
//         updated,
//       });
//     } catch (err) {
//       console.error("Error updating society:", err);
//       res.status(500).json({ error: "Failed to update society" });
//     }
//   },

//   // Delete society
//   delete: async (req, res) => {
//     try {
//       const existingSociety = await SocietyModel.getSocietyById(req.params.id);
//       if (!existingSociety) {
//         return res.status(404).json({ error: "Society not found" });
//       }

//       const deleted = await SocietyModel.deleteSociety(req.params.id);

//       if (deleted === 0) {
//         return res.status(404).json({ error: "Society not found" });
//       }

//       res.json({
//         success: true,
//         message: "Society deleted successfully",
//         deleted,
//       });
//     } catch (err) {
//       console.error("Error deleting society:", err);
//       res.status(500).json({ error: "Failed to delete society" });
//     }
//   },

//   // Bulk create societies
//   bulkCreate: async (req, res) => {
//     try {
//       const { societies } = req.body;

//       if (!Array.isArray(societies) || societies.length === 0) {
//         return res.status(400).json({
//           error: "Invalid request: societies array is required",
//         });
//       }

//       const results = [];
//       const errors = [];

//       for (const society of societies) {
//         try {
//           const { societyName, locality, city, pincode, status } = society;

//           if (!societyName || !locality || !city || !pincode) {
//             errors.push({ society, error: "Missing required fields" });
//             continue;
//           }

//           const pincodeRegex = /^[1-9][0-9]{5}$/;
//           if (!pincodeRegex.test(pincode)) {
//             errors.push({ society, error: "Invalid pincode format" });
//             continue;
//           }

//           const id = await SocietyModel.createSociety({
//             societyName,
//             locality,
//             city,
//             pincode,
//             status: status || "Active",
//           });

//           results.push({ id, societyName });
//         } catch (err) {
//           errors.push({ society, error: err.message });
//         }
//       }

//       res.status(201).json({
//         success: true,
//         message: `Created ${results.length} societies, ${errors.length} failed`,
//         results,
//         errors,
//       });
//     } catch (err) {
//       console.error("Error bulk creating societies:", err);
//       res.status(500).json({ error: "Failed to bulk create societies" });
//     }
//   },

//   // 📌 EXPORT societies to EXCEL
//   exportSocieties: async (req, res) => {
//     try {
//       const societies = await SocietyModel.getAllSocieties();

//       // Prepare data for Excel
//       const excelData = societies.map((society) => ({
//         "Society Name": society.society_name,
//         Locality: society.locality,
//         City: society.city,
//         Pincode: society.pincode,
//         Status: society.status,
//       }));

//       // Create worksheet
//       const worksheet = XLSX.utils.json_to_sheet(excelData);

//       // Set column widths
//       worksheet["!cols"] = [
//         { wch: 30 }, // Society Name
//         { wch: 25 }, // Locality
//         { wch: 20 }, // City
//         { wch: 12 }, // Pincode
//         { wch: 10 }, // Status
//       ];

//       // Create workbook
//       const workbook = XLSX.utils.book_new();
//       XLSX.utils.book_append_sheet(workbook, worksheet, "Societies");

//       // Generate buffer
//       const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

//       // Set response headers
//       res.setHeader(
//         "Content-Type",
//         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//       );
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename=societies_${Date.now()}.xlsx`,
//       );

//       res.send(buffer);
//     } catch (err) {
//       console.error("Error exporting societies:", err);
//       res.status(500).json({ error: "Failed to export societies" });
//     }
//   },

//   // 📌 IMPORT societies from EXCEL/CSV
//   importSocieties: async (req, res) => {
//     try {
//       if (!req.file) {
//         return res.status(400).json({ error: "No file uploaded" });
//       }

//       const results = [];
//       const errors = [];
//       let jsonData = [];

//       // Handle Excel file (.xlsx, .xls)
//       if (
//         req.file.mimetype ===
//           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
//         req.file.mimetype === "application/vnd.ms-excel" ||
//         req.file.originalname.endsWith(".xlsx") ||
//         req.file.originalname.endsWith(".xls")
//       ) {
//         // Read Excel file
//         const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
//         const sheetName = workbook.SheetNames[0];
//         const worksheet = workbook.Sheets[sheetName];
//         jsonData = XLSX.utils.sheet_to_json(worksheet);
//       }
//       // Handle CSV file
//       else if (
//         req.file.mimetype === "text/csv" ||
//         req.file.originalname.endsWith(".csv")
//       ) {
//         const csvData = req.file.buffer.toString();
//         const rows = csvData.split("\n");
//         const headers = rows[0].split(",").map((h) => h.trim());

//         for (let i = 1; i < rows.length; i++) {
//           if (!rows[i].trim()) continue;
//           const values = rows[i].split(",");
//           const row = {};
//           headers.forEach((header, idx) => {
//             row[header] = values[idx]?.trim();
//           });
//           jsonData.push(row);
//         }
//       } else {
//         return res.status(400).json({
//           error: "Please upload Excel (.xlsx, .xls) or CSV file format",
//         });
//       }

//       // Process the data
//       for (let i = 0; i < jsonData.length; i++) {
//         const row = jsonData[i];

//         const societyName = row["Society Name"] || row.societyName || "";
//         const locality = row["Locality"] || row.locality || "";
//         const city = row["City"] || row.city || "";
//         const pincode = String(row["Pincode"] || row.pincode || "");
//         const status = row["Status"] || row.status || "Active";

//         if (!societyName || !locality || !city || !pincode) {
//           errors.push({ row: i + 2, error: "Missing required fields" });
//           continue;
//         }

//         const pincodeRegex = /^[1-9][0-9]{5}$/;
//         if (!pincodeRegex.test(pincode)) {
//           errors.push({ row: i + 2, error: "Invalid pincode format" });
//           continue;
//         }

//         try {
//           const id = await SocietyModel.createSociety({
//             societyName,
//             locality,
//             city,
//             pincode,
//             status,
//           });
//           results.push({ id, societyName, row: i + 2 });
//         } catch (err) {
//           errors.push({ row: i + 2, error: err.message });
//         }
//       }

//       res.json({
//         success: true,
//         message: `Imported ${results.length} societies, ${errors.length} failed`,
//         results,
//         errors,
//       });
//     } catch (err) {
//       console.error("Error importing societies:", err);
//       res.status(500).json({ error: "Failed to import societies" });
//     }
//   },
// };

// module.exports = SocietyController;

const db = require("../config/database");
const SocietyModel = require("../models/SocietyModel");
const { v4: uuidv4 } = require("uuid");
const XLSX = require("xlsx");

const SocietyController = {
  // 🔥 UPDATED: Create new society with duplicate check
  create: async (req, res) => {
    try {
      const { societyName, locality, city, pincode, status } = req.body;

      if (!societyName || !locality || !city || !pincode) {
        return res.status(400).json({
          error:
            "Missing required fields: societyName, locality, city, pincode",
        });
      }

      const pincodeRegex = /^[1-9][0-9]{5}$/;
      if (!pincodeRegex.test(pincode)) {
        return res.status(400).json({
          error:
            "Invalid pincode format. Must be a valid 6-digit Indian pincode",
        });
      }

      // 🔥 CHECK FOR DUPLICATE BEFORE CREATING
      const existing = await SocietyModel.checkDuplicate(
        societyName,
        locality,
        city,
        pincode,
      );

      if (existing) {
        return res.status(409).json({
          error: `Society "${societyName}" already exists in ${locality}, ${city} - ${pincode}`,
          existingId: existing.id,
        });
      }

      const id = await SocietyModel.createSociety({
        societyName,
        locality,
        city,
        pincode,
        status: status || "Active",
      });

      res.status(201).json({
        success: true,
        message: "Society created successfully",
        id,
      });
    } catch (err) {
      console.error("Error creating society:", err);
      res.status(500).json({ error: "Failed to create society" });
    }
  },

  // Get all societies
  getAll: async (req, res) => {
    try {
      const { search, pincode, city } = req.query;

      let societies;
      if (search) {
        societies = await SocietyModel.searchSocieties(search);
      } else if (pincode) {
        societies = await SocietyModel.getSocietiesByPincode(pincode);
      } else if (city) {
        societies = await SocietyModel.getSocietiesByCity(city);
      } else {
        societies = await SocietyModel.getAllSocieties();
      }

      const formattedSocieties = societies.map((society) => ({
        id: society.id,
        societyName: society.society_name,
        locality: society.locality,
        city: society.city,
        pincode: society.pincode,
        status: society.status,
        createdAt: society.created_at,
      }));

      res.json(formattedSocieties);
    } catch (err) {
      console.error("Error fetching societies:", err);
      res.status(500).json({ error: "Failed to fetch societies" });
    }
  },

  // Get society by ID
  getById: async (req, res) => {
    try {
      const society = await SocietyModel.getSocietyById(req.params.id);

      if (!society) {
        return res.status(404).json({ error: "Society not found" });
      }

      const formattedSociety = {
        id: society.id,
        societyName: society.society_name,
        locality: society.locality,
        city: society.city,
        pincode: society.pincode,
        status: society.status,
        createdAt: society.created_at,
      };

      res.json(formattedSociety);
    } catch (err) {
      console.error("Error fetching society:", err);
      res.status(500).json({ error: "Failed to fetch society" });
    }
  },

  // Get society by ID or Name
  getSocietyByIdentifier: async (req, res) => {
    try {
      const { identifier } = req.params;

      if (!identifier) {
        return res.status(400).json({ error: "Identifier is required" });
      }

      let society = await SocietyModel.getSocietyById(identifier);

      if (!society) {
        const allSocieties = await SocietyModel.getAllSocieties();
        society = allSocieties.find((s) =>
          s.society_name.toLowerCase().includes(identifier.toLowerCase()),
        );
      }

      if (!society) {
        return res.status(404).json({ error: "Society not found" });
      }

      const formattedSociety = {
        id: society.id,
        societyName: society.society_name,
        society_name: society.society_name,
        locality: society.locality,
        city: society.city,
        pincode: society.pincode,
        status: society.status,
        created_at: society.created_at,
      };

      res.json(formattedSociety);
    } catch (err) {
      console.error("Error fetching society by identifier:", err);
      res.status(500).json({ error: "Failed to fetch society" });
    }
  },

  // 🔥 UPDATED: Update society with duplicate check
  update: async (req, res) => {
    try {
      const { societyName, locality, city, pincode, status } = req.body;

      const existingSociety = await SocietyModel.getSocietyById(req.params.id);
      if (!existingSociety) {
        return res.status(404).json({ error: "Society not found" });
      }

      if (pincode) {
        const pincodeRegex = /^[1-9][0-9]{5}$/;
        if (!pincodeRegex.test(pincode)) {
          return res.status(400).json({
            error:
              "Invalid pincode format. Must be a valid 6-digit Indian pincode",
          });
        }
      }

      // 🔥 CHECK FOR DUPLICATE BEFORE UPDATING (excluding current society)
      const duplicate = await SocietyModel.checkDuplicateForUpdate(
        req.params.id,
        societyName,
        locality,
        city,
        pincode,
      );

      if (duplicate) {
        return res.status(409).json({
          error: `Another society "${societyName}" already exists in ${locality}, ${city} - ${pincode}`,
          existingId: duplicate.id,
        });
      }

      const updated = await SocietyModel.updateSociety(req.params.id, {
        societyName,
        locality,
        city,
        pincode,
        status,
      });

      if (updated === 0) {
        return res.status(404).json({ error: "Society not found" });
      }

      res.json({
        success: true,
        message: "Society updated successfully",
        updated,
      });
    } catch (err) {
      console.error("Error updating society:", err);
      res.status(500).json({ error: "Failed to update society" });
    }
  },

  // Delete society
  delete: async (req, res) => {
    try {
      const existingSociety = await SocietyModel.getSocietyById(req.params.id);
      if (!existingSociety) {
        return res.status(404).json({ error: "Society not found" });
      }

      const deleted = await SocietyModel.deleteSociety(req.params.id);

      if (deleted === 0) {
        return res.status(404).json({ error: "Society not found" });
      }

      res.json({
        success: true,
        message: "Society deleted successfully",
        deleted,
      });
    } catch (err) {
      console.error("Error deleting society:", err);
      res.status(500).json({ error: "Failed to delete society" });
    }
  },

  // Bulk create societies
  bulkCreate: async (req, res) => {
    try {
      const { societies } = req.body;

      if (!Array.isArray(societies) || societies.length === 0) {
        return res.status(400).json({
          error: "Invalid request: societies array is required",
        });
      }

      const results = [];
      const errors = [];

      for (const society of societies) {
        try {
          const { societyName, locality, city, pincode, status } = society;

          if (!societyName || !locality || !city || !pincode) {
            errors.push({ society, error: "Missing required fields" });
            continue;
          }

          const pincodeRegex = /^[1-9][0-9]{5}$/;
          if (!pincodeRegex.test(pincode)) {
            errors.push({ society, error: "Invalid pincode format" });
            continue;
          }

          const id = await SocietyModel.createSociety({
            societyName,
            locality,
            city,
            pincode,
            status: status || "Active",
          });

          results.push({ id, societyName });
        } catch (err) {
          errors.push({ society, error: err.message });
        }
      }

      res.status(201).json({
        success: true,
        message: `Created ${results.length} societies, ${errors.length} failed`,
        results,
        errors,
      });
    } catch (err) {
      console.error("Error bulk creating societies:", err);
      res.status(500).json({ error: "Failed to bulk create societies" });
    }
  },

  // 📌 EXPORT societies to EXCEL
  exportSocieties: async (req, res) => {
    try {
      const societies = await SocietyModel.getAllSocieties();

      const excelData = societies.map((society) => ({
        "Society Name": society.society_name,
        Locality: society.locality,
        City: society.city,
        Pincode: society.pincode,
        Status: society.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 25 },
        { wch: 20 },
        { wch: 12 },
        { wch: 10 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Societies");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=societies_${Date.now()}.xlsx`,
      );

      res.send(buffer);
    } catch (err) {
      console.error("Error exporting societies:", err);
      res.status(500).json({ error: "Failed to export societies" });
    }
  },

  // 📌 UPDATED: IMPORT societies with duplicate check
  importSocieties: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const results = [];
      const errors = [];
      const duplicates = [];
      let jsonData = [];

      // Handle Excel file (.xlsx, .xls)
      if (
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        req.file.mimetype === "application/vnd.ms-excel" ||
        req.file.originalname.endsWith(".xlsx") ||
        req.file.originalname.endsWith(".xls")
      ) {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(worksheet);
      }
      // Handle CSV file
      else if (
        req.file.mimetype === "text/csv" ||
        req.file.originalname.endsWith(".csv")
      ) {
        const csvData = req.file.buffer.toString();
        const rows = csvData.split("\n");
        const headers = rows[0].split(",").map((h) => h.trim());

        for (let i = 1; i < rows.length; i++) {
          if (!rows[i].trim()) continue;
          const values = rows[i].split(",");
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx]?.trim();
          });
          jsonData.push(row);
        }
      } else {
        return res.status(400).json({
          error: "Please upload Excel (.xlsx, .xls) or CSV file format",
        });
      }

      // Process each row with duplicate check
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];

        const societyName = row["Society Name"] || row.societyName || "";
        const locality = row["Locality"] || row.locality || "";
        const city = row["City"] || row.city || "";
        const pincode = String(row["Pincode"] || row.pincode || "");
        const status = row["Status"] || row.status || "Active";

        if (!societyName || !locality || !city || !pincode) {
          errors.push({
            row: i + 2,
            error: "Missing required fields",
            data: row,
          });
          continue;
        }

        const pincodeRegex = /^[1-9][0-9]{5}$/;
        if (!pincodeRegex.test(pincode)) {
          errors.push({
            row: i + 2,
            error: "Invalid pincode format",
            data: row,
          });
          continue;
        }

        // 🔥 CHECK FOR DUPLICATE BEFORE IMPORTING
        const existing = await SocietyModel.checkDuplicate(
          societyName,
          locality,
          city,
          pincode,
        );

        if (existing) {
          duplicates.push({
            row: i + 2,
            error: "Duplicate - already exists",
            data: { societyName, locality, city, pincode },
            existingId: existing.id,
          });
          continue;
        }

        try {
          const id = await SocietyModel.createSociety({
            societyName,
            locality,
            city,
            pincode,
            status,
          });
          results.push({ id, societyName, row: i + 2 });
        } catch (err) {
          errors.push({ row: i + 2, error: err.message, data: row });
        }
      }

      res.json({
        success: true,
        message: `Imported ${results.length} societies, ${errors.length} failed, ${duplicates.length} duplicates skipped`,
        results,
        errors,
        duplicates,
      });
    } catch (err) {
      console.error("Error importing societies:", err);
      res.status(500).json({ error: "Failed to import societies" });
    }
  },
};

module.exports = SocietyController;