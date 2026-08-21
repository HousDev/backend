// // controllers/bulkOperations.controller.js
// const Property = require("../models/Property");
// const StatusUpdate = require("../models/PropertyStatusHistory");
// const path = require("path");
// const fs = require("fs");

// /* ---------------------------
//    small helpers
// ---------------------------- */
// const createBulkOperationRecord = async (operationType, propertyIds, userId = "Admin") => {
//   try {
//     return {
//       operationId: `bulk_${operationType}_${Date.now()}`,
//       type: operationType,
//       propertyIds,
//       userId,
//       timestamp: new Date().toISOString(),
//       status: "pending",
//     };
//   } catch (e) {
//     console.error("Failed to create bulk operation record:", e);
//     return null;
//   }
// };

// const summarize = (total, successful) => ({
//   totalProcessed: total,
//   successful,
//   failed: Math.max(0, total - successful),
// });

// /* ---------------------------
//    BULK: Update Status
// ---------------------------- */
// const bulkUpdateStatus = async (req, res) => {
//   try {
//     const { propertyIds, status, remarks, updatedBy = "Admin User" } = req.body;
//     if (!Array.isArray(propertyIds) || !propertyIds.length) {
//       return res.status(400).json({ success: false, message: "Property IDs array is required" });
//     }
//     if (!status) {
//       return res.status(400).json({ success: false, message: "Status is required" });
//     }

//     const bulkOperation = await createBulkOperationRecord("status_update", propertyIds, updatedBy);

//     // fetch current states once (to capture previous_status)
//     const beforeRows = await Property.getMany(propertyIds);
//     const prevById = new Map(beforeRows.map(r => [Number(r.id), r.status || null]));

//     // single SQL update (prevents null-ing other fields)
//     const { affected } = await Property.bulkUpdateStatus(propertyIds, status);

//     // write history (optional)
//     for (const id of propertyIds) {
//       await StatusUpdate.create({
//         property_id: id,
//         status,
//         previous_status: prevById.get(Number(id)) ?? null,
//         remarks: remarks || `Bulk status update to ${status}`,
//         update_reason: "Bulk operation",
//         updated_by: updatedBy,
//         notify_parties: true,
//       });
//     }

//     return res.json({
//       success: true,
//       message: "Bulk status update completed",
//       data: {
//         operation: bulkOperation,
//         summary: summarize(propertyIds.length, affected),
//       },
//     });
//   } catch (error) {
//     console.error("Bulk status update failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Bulk status update failed",
//       error: error.message,
//     });
//   }
// };

// /* ---------------------------
//    BULK: Mark Public
// ---------------------------- */
// const bulkMarkPublic = async (req, res) => {
//   try {
//     const { propertyIds, updatedBy = "Admin User" } = req.body;
//     if (!Array.isArray(propertyIds) || !propertyIds.length) {
//       return res.status(400).json({ success: false, message: "Property IDs array is required" });
//     }

//     const bulkOperation = await createBulkOperationRecord("mark_public", propertyIds, updatedBy);

//     // single SQL that also sets publication_date/updated_at inside DB
//     const { affected } = await Property.bulkMarkPublic(propertyIds, true);

//     return res.json({
//       success: true,
//       message: "Bulk mark public completed",
//       data: {
//         operation: bulkOperation,
//         summary: summarize(propertyIds.length, affected),
//       },
//     });
//   } catch (error) {
//     console.error("Bulk mark public failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Bulk mark public failed",
//       error: error.message,
//     });
//   }
// };

// /* ---------------------------
//    BULK: Delete Properties
// ---------------------------- */
// const bulkDelete = async (req, res) => {
//   try {
//     const { propertyIds, updatedBy = "Admin User" } = req.body;
//     if (!Array.isArray(propertyIds) || !propertyIds.length) {
//       return res.status(400).json({ success: false, message: "Property IDs array is required" });
//     }

//     const bulkOperation = await createBulkOperationRecord("delete", propertyIds, updatedBy);

//     // fetch all once to clean up files
//     const rows = await Property.getMany(propertyIds);

//     for (const p of rows) {
//       try {
//         // delete photos
//         const photos = Array.isArray(p.photos) ? p.photos : [];
//         for (const rel of photos) {
//           if (rel && typeof rel === "string" && rel.startsWith("/uploads/")) {
//             const full = path.join(process.cwd(), "public", rel);
//             if (fs.existsSync(full)) fs.unlinkSync(full);
//           }
//         }
//         // delete ownership doc
//         if (p.ownership_doc_path && p.ownership_doc_path.startsWith("/uploads/")) {
//           const full = path.join(process.cwd(), "public", p.ownership_doc_path);
//           if (fs.existsSync(full)) fs.unlinkSync(full);
//         }
//       } catch (fileErr) {
//         // continue even if file removal fails
//         console.warn(`File cleanup failed for property ${p.id}:`, fileErr.message);
//       }
//     }

//     // delete all rows in one go
//     const { affected } = await Property.bulkDelete(propertyIds);

//     return res.json({
//       success: true,
//       message: "Bulk delete completed",
//       data: {
//         operation: bulkOperation,
//         summary: summarize(propertyIds.length, affected),
//       },
//     });
//   } catch (error) {
//     console.error("Bulk delete failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Bulk delete failed",
//       error: error.message,
//     });
//   }
// };

// /* ---------------------------
//    BULK: Export (CSV / JSON)
// ---------------------------- */
// const bulkExport = async (req, res) => {
//   try {
//     const { propertyIds, format = "csv", updatedBy = "Admin User" } = req.body;
//     if (!Array.isArray(propertyIds) || !propertyIds.length) {
//       return res.status(400).json({ success: false, message: "Property IDs array is required" });
//     }

//     const bulkOperation = await createBulkOperationRecord("export", propertyIds, updatedBy);

//     // fetch all once
//     const rows = await Property.getMany(propertyIds);

//     const exportData = rows.map((property) => ({
//       id: property.id,
//       propertyId: property.property_id || `PROP${property.id}`,
//       sellerName: property.seller_name,
//       propertyType: property.property_type_name,
//       propertySubtype: property.property_subtype_name,
//       unitType: property.unit_type,
//       wing: property.wing,
//       unitNo: property.unit_no,
//       furnishing: property.furnishing,
//       parkingType: property.parking_type,
//       parkingQty: property.parking_qty,
//       city: property.city_name,
//       location: property.location_name,
//       society: property.society_name,
//       floor: property.floor,
//       totalFloors: property.total_floors,
//       carpetArea: property.carpet_area,
//       builtupArea: property.builtup_area,
//       budget: property.budget,
//       address: property.address,
//       status: property.status,
//       leadSource: property.lead_source,
//       possessionMonth: property.possession_month,
//       possessionYear: property.possession_year,
//       purchaseMonth: property.purchase_month,
//       purchaseYear: property.purchase_year,
//       sellingRights: property.selling_rights,
//       description: property.description,
//       isPublic: !!property.is_public,
//       publicationDate: property.publication_date,
//       createdAt: property.created_at,
//       updatedAt: property.updated_at,
//       amenities: Array.isArray(property.amenities) ? property.amenities.join(", ") : property.amenities,
//       furnishingItems: Array.isArray(property.furnishing_items) ? property.furnishing_items.join(", ") : property.furnishing_items,
//       photoCount: Array.isArray(property.photos) ? property.photos.length : 0,
//     }));

//     if (format === "json") {
//       return res.json({
//         success: true,
//         message: "Bulk export completed",
//         data: { operation: bulkOperation, summary: summarize(propertyIds.length, exportData.length), exportData },
//       });
//     }

//     // CSV
//     if (!exportData.length) {
//       return res.status(400).json({ success: false, message: "No valid properties to export" });
//     }

//     const headers = Object.keys(exportData[0]);
//     const csv = [
//       headers.join(","),
//       ...exportData.map((row) =>
//         headers
//           .map((h) => {
//             const value = row[h] ?? "";
//             return typeof value === "string" && (value.includes(",") || value.includes('"'))
//               ? `"${value.replace(/"/g, '""')}"`
//               : value;
//           })
//           .join(",")
//       ),
//     ].join("\n");

//     res.setHeader("Content-Type", "text/csv");
//     res.setHeader("Content-Disposition", `attachment; filename="properties_export_${Date.now()}.csv"`);
//     return res.send(csv);
//   } catch (error) {
//     console.error("Bulk export failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Bulk export failed",
//       error: error.message,
//     });
//   }
// };

// /* ---------------------------
//    SINGLE: Mark Public
// ---------------------------- */
// const markPublic = async (req, res) => {
//   try {
//     const id = req.params.id;
//     const prop = await Property.getById(id);
//     if (!prop) {
//       return res.status(404).json({ success: false, message: "Property not found" });
//     }

//     // prefer toggle helper if present
//     if (typeof Property.togglePublic === "function") {
//       await Property.togglePublic(id, true);
//     } else {
//       await Property.updatePartial(id, { is_public: 1, publication_date: new Date() });
//     }

//     return res.json({
//       success: true,
//       message: "Property marked as public successfully",
//       data: { propertyId: id },
//     });
//   } catch (error) {
//     console.error("Mark public failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to mark property as public",
//       error: error.message,
//     });
//   }
// };

// /* ---------------------------
//    OPERATION STATUS (mock)
// ---------------------------- */
// const getOperationStatus = async (req, res) => {
//   try {
//     const { operationId } = req.params;
//     return res.json({
//       success: true,
//       data: {
//         operationId,
//         status: "completed",
//         timestamp: new Date().toISOString(),
//         message: "Operation completed successfully",
//       },
//     });
//   } catch (error) {
//     console.error("Get operation status failed:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to get operation status",
//       error: error.message,
//     });
//   }
// };

// module.exports = {
//   bulkUpdateStatus,
//   bulkMarkPublic,
//   bulkDelete,
//   bulkExport,
//   markPublic,
//   getOperationStatus,
// };


// controllers/bulkOperations.controller.js
const Property = require("../models/Property");
const RentalProperty = require("../models/RentalProperty");
const StatusUpdate = require("../models/PropertyStatusHistory");
const path = require("path");
const fs = require("fs");

/* ---------------------------
   Helper: resolve model from request
---------------------------- */
const resolveModel = (req) => {
  const isRental =
    req.body?.isRental === true ||
    req.body?.isRental === 'true' ||
    req.query?.isRental === 'true' ||
    req.query?.isRental === true ||
    (req.body?.data && (req.body.data.isRental === true || req.body.data.isRental === 'true'));
  return isRental ? RentalProperty : Property;
};

/* ---------------------------
   small helpers
---------------------------- */
const createBulkOperationRecord = async (operationType, propertyIds, userId = "Admin") => {
  try {
    return {
      operationId: `bulk_${operationType}_${Date.now()}`,
      type: operationType,
      propertyIds,
      userId,
      timestamp: new Date().toISOString(),
      status: "pending",
    };
  } catch (e) {
    console.error("Failed to create bulk operation record:", e);
    return null;
  }
};

const summarize = (total, successful) => ({
  totalProcessed: total,
  successful,
  failed: Math.max(0, total - successful),
});

/* ---------------------------
   BULK: Update Status
---------------------------- */
const bulkUpdateStatus = async (req, res) => {
  try {
    const { propertyIds, status, remarks, updatedBy = "Admin User" } = req.body;
    if (!Array.isArray(propertyIds) || !propertyIds.length) {
      return res.status(400).json({ success: false, message: "Property IDs array is required" });
    }
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    const PropertyModel = resolveModel(req);
    const bulkOperation = await createBulkOperationRecord("status_update", propertyIds, updatedBy);

    // fetch current states once (to capture previous_status)
    const beforeRows = typeof PropertyModel.getMany === 'function' ? await PropertyModel.getMany(propertyIds) : [];
    const prevById = new Map(beforeRows.map(r => [Number(r.id), r.status || null]));

    // single SQL update (prevents null-ing other fields)
    const { affected } = await PropertyModel.bulkUpdateStatus(propertyIds, status);

    // write history (optional)
    for (const id of propertyIds) {
      await StatusUpdate.create({
        property_id: id,
        status,
        previous_status: prevById.get(Number(id)) ?? null,
        remarks: remarks || `Bulk status update to ${status}`,
        update_reason: "Bulk operation",
        updated_by: updatedBy,
        notify_parties: true,
      });
    }

    return res.json({
      success: true,
      message: "Bulk status update completed",
      data: {
        operation: bulkOperation,
        summary: summarize(propertyIds.length, affected),
      },
    });
  } catch (error) {
    console.error("Bulk status update failed:", error);
    return res.status(500).json({
      success: false,
      message: "Bulk status update failed",
      error: error.message,
    });
  }
};

/* ---------------------------
   BULK: Mark Public / Private
---------------------------- */
const bulkMarkPublic = async (req, res) => {
  try {
    const { propertyIds, updatedBy = "Admin User" } = req.body;
    if (!Array.isArray(propertyIds) || !propertyIds.length) {
      return res.status(400).json({ success: false, message: "Property IDs array is required" });
    }

    const PropertyModel = resolveModel(req);
    const bulkOperation = await createBulkOperationRecord("mark_public", propertyIds, updatedBy);

    // single SQL that also sets publication_date/updated_at inside DB
    const { affected } = await PropertyModel.bulkMarkPublic(propertyIds, true);

    return res.json({
      success: true,
      message: "Bulk mark public completed",
      data: {
        operation: bulkOperation,
        summary: summarize(propertyIds.length, affected),
      },
    });
  } catch (error) {
    console.error("Bulk mark public failed:", error);
    return res.status(500).json({
      success: false,
      message: "Bulk mark public failed",
      error: error.message,
    });
  }
};

const bulkMarkPrivate = async (req, res) => {
  try {
    const { propertyIds, updatedBy = "Admin User" } = req.body;
    if (!Array.isArray(propertyIds) || !propertyIds.length) {
      return res.status(400).json({ success: false, message: "Property IDs array is required" });
    }

    const PropertyModel = resolveModel(req);
    const bulkOperation = await createBulkOperationRecord("mark_private", propertyIds, updatedBy);

    // set is_public = 0 and clear publication_date
    const { affected } = await PropertyModel.bulkMarkPublic(propertyIds, false);

    return res.json({
      success: true,
      message: "Bulk mark private completed",
      data: {
        operation: bulkOperation,
        summary: summarize(propertyIds.length, affected),
      },
    });
  } catch (error) {
    console.error("Bulk mark private failed:", error);
    return res.status(500).json({
      success: false,
      message: "Bulk mark private failed",
      error: error.message,
    });
  }
};

// Flexible bulk endpoint that honors a boolean flag
const bulkSetVisibility = async (req, res) => {
  try {
    const { propertyIds, isPublic, updatedBy = "Admin User" } = req.body;
    if (!Array.isArray(propertyIds) || !propertyIds.length) {
      return res.status(400).json({ success: false, message: "Property IDs array is required" });
    }
    if (typeof isPublic !== "boolean") {
      return res.status(400).json({ success: false, message: "isPublic (boolean) is required" });
    }

    const PropertyModel = resolveModel(req);
    const opName = isPublic ? "mark_public" : "mark_private";
    const bulkOperation = await createBulkOperationRecord(opName, propertyIds, updatedBy);
    const { affected } = await PropertyModel.bulkMarkPublic(propertyIds, isPublic);

    return res.json({
      success: true,
      message: `Bulk visibility set to ${isPublic ? "public" : "private"}`,
      data: {
        operation: bulkOperation,
        summary: summarize(propertyIds.length, affected),
      },
    });
  } catch (error) {
    console.error("Bulk set visibility failed:", error);
    return res.status(500).json({
      success: false,
      message: "Bulk set visibility failed",
      error: error.message,
    });
  }
};

/* ---------------------------
   BULK: Delete Properties
---------------------------- */
const bulkDelete = async (req, res) => {
  try {
    const { propertyIds, updatedBy = "Admin User" } = req.body;
    if (!Array.isArray(propertyIds) || !propertyIds.length) {
      return res.status(400).json({ success: false, message: "Property IDs array is required" });
    }

    const PropertyModel = resolveModel(req);
    const bulkOperation = await createBulkOperationRecord("delete", propertyIds, updatedBy);

    // fetch all once to clean up files
    const rows = typeof PropertyModel.getMany === 'function' ? await PropertyModel.getMany(propertyIds) : [];

    for (const p of rows) {
      try {
        // delete photos
        const photos = Array.isArray(p.photos) ? p.photos : [];
        for (const rel of photos) {
          if (rel && typeof rel === "string" && rel.startsWith("/uploads/")) {
            const full = path.join(process.cwd(), "public", rel);
            if (fs.existsSync(full)) fs.unlinkSync(full);
          }
        }
        // delete ownership doc
        if (p.ownership_doc_path && p.ownership_doc_path.startsWith("/uploads/")) {
          const full = path.join(process.cwd(), "public", p.ownership_doc_path);
          if (fs.existsSync(full)) fs.unlinkSync(full);
        }
      } catch (fileErr) {
        // continue even if file removal fails
        console.warn(`File cleanup failed for property ${p.id}:`, fileErr.message);
      }
    }

    // delete all rows in one go
    const { affected } = await PropertyModel.bulkDelete(propertyIds);

    return res.json({
      success: true,
      message: "Bulk delete completed",
      data: {
        operation: bulkOperation,
        summary: summarize(propertyIds.length, affected),
      },
    });
  } catch (error) {
    console.error("Bulk delete failed:", error);
    return res.status(500).json({
      success: false,
      message: "Bulk delete failed",
      error: error.message,
    });
  }
};

/* ---------------------------
   BULK: Export (CSV / JSON)
---------------------------- */
const bulkExport = async (req, res) => {
  try {
    const { propertyIds, format = "csv", updatedBy = "Admin User" } = req.body;
    if (!Array.isArray(propertyIds) || !propertyIds.length) {
      return res.status(400).json({ success: false, message: "Property IDs array is required" });
    }

    const PropertyModel = resolveModel(req);
    const isRentalExport = PropertyModel === RentalProperty;
    const bulkOperation = await createBulkOperationRecord("export", propertyIds, updatedBy);

    // fetch all once
    const rows = typeof PropertyModel.getMany === 'function' ? await PropertyModel.getMany(propertyIds) : [];

    const exportData = rows.map((property) => {
      const base = {
        id: property.id,
        propertyId: property.property_id || `PROP${property.id}`,
        sellerName: property.seller_name,
        propertyType: property.property_type_name,
        propertySubtype: property.property_subtype_name,
        unitType: property.unit_type,
        wing: property.wing,
        unitNo: property.unit_no,
        furnishing: property.furnishing,
        parkingType: property.parking_type,
        parkingQty: property.parking_qty,
        city: property.city_name,
        location: property.location_name,
        society: property.society_name,
        floor: property.floor,
        totalFloors: property.total_floors,
        carpetArea: property.carpet_area,
        builtupArea: property.builtup_area,
        address: property.address,
        status: property.status,
        leadSource: property.lead_source,
        description: property.description,
        isPublic: !!property.is_public,
        publicationDate: property.publication_date,
        createdAt: property.created_at,
        updatedAt: property.updated_at,
        amenities: Array.isArray(property.amenities) ? property.amenities.join(", ") : property.amenities,
        furnishingItems: Array.isArray(property.furnishing_items) ? property.furnishing_items.join(", ") : property.furnishing_items,
        photoCount: Array.isArray(property.photos) ? property.photos.length : 0,
      };

      if (isRentalExport) {
        // Rental-specific fields
        return {
          ...base,
          monthlyRent: property.monthly_rent,
          securityDeposit: property.security_deposit,
          maintenanceExtra: !!property.maintenance_extra,
          maintenanceCharge: property.maintenance_charge,
          preferredTenants: property.preferred_tenants,
          lockInPeriod: property.lock_in_period,
          agreementDuration: property.agreement_duration,
          availableFrom: property.available_from,
        };
      }

      // Sale-specific fields
      return {
        ...base,
        budget: property.budget,
        possessionMonth: property.possession_month,
        possessionYear: property.possession_year,
        purchaseMonth: property.purchase_month,
        purchaseYear: property.purchase_year,
        sellingRights: property.selling_rights,
      };
    });

    if (format === "json") {
      return res.json({
        success: true,
        message: "Bulk export completed",
        data: { operation: bulkOperation, summary: summarize(propertyIds.length, exportData.length), exportData },
      });
    }

    // CSV
    if (!exportData.length) {
      return res.status(400).json({ success: false, message: "No valid properties to export" });
    }

    const headers = Object.keys(exportData[0]);
    const csv = [
      headers.join(","),
      ...exportData.map((row) =>
        headers
          .map((h) => {
            const value = row[h] ?? "";
            return typeof value === "string" && (value.includes(",") || value.includes('"'))
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          })
          .join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="properties_export_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error("Bulk export failed:", error);
    return res.status(500).json({
      success: false,
      message: "Bulk export failed",
      error: error.message,
    });
  }
};

/* ---------------------------
   SINGLE: Mark Public / Private
---------------------------- */
const markPublic = async (req, res) => {
  try {
    const id = req.params.id;
    const PropertyModel = resolveModel(req);
    const prop = await PropertyModel.getById(id);
    if (!prop) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    // prefer toggle helper if present
    if (typeof PropertyModel.togglePublic === "function") {
      await PropertyModel.togglePublic(id, true);
    } else {
      await PropertyModel.updatePartial?.(id, { is_public: 1, publication_date: new Date() }) ||
      await PropertyModel.update(id, { is_public: 1, publication_date: new Date() });
    }

    return res.json({
      success: true,
      message: "Property marked as public successfully",
      data: { propertyId: id },
    });
  } catch (error) {
    console.error("Mark public failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark property as public",
      error: error.message,
    });
  }
};

const markPrivate = async (req, res) => {
  try {
    const id = req.params.id;
    const PropertyModel = resolveModel(req);
    const prop = await PropertyModel.getById(id);
    if (!prop) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    if (typeof PropertyModel.togglePublic === "function") {
      await PropertyModel.togglePublic(id, false);
    } else {
      // clear publication_date when private
      await PropertyModel.updatePartial?.(id, { is_public: 0, publication_date: null }) ||
      await PropertyModel.update(id, { is_public: 0, publication_date: null });
    }

    return res.json({
      success: true,
      message: "Property marked as private successfully",
      data: { propertyId: id },
    });
  } catch (error) {
    console.error("Mark private failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark property as private",
      error: error.message,
    });
  }
};

// Flexible single endpoint that honors a boolean flag
const setVisibility = async (req, res) => {
  try {
    const id = req.params.id;
    const { isPublic } = req.body;
    if (typeof isPublic !== "boolean") {
      return res.status(400).json({ success: false, message: "isPublic (boolean) is required" });
    }

    const PropertyModel = resolveModel(req);
    const prop = await PropertyModel.getById(id);
    if (!prop) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    if (typeof PropertyModel.togglePublic === "function") {
      await PropertyModel.togglePublic(id, isPublic);
    } else {
      await PropertyModel.updatePartial?.(id, {
        is_public: isPublic ? 1 : 0,
        publication_date: isPublic ? new Date() : null,
      }) || await PropertyModel.update(id, {
        is_public: isPublic ? 1 : 0,
        publication_date: isPublic ? new Date() : null,
      });
    }

    return res.json({
      success: true,
      message: `Property visibility set to ${isPublic ? "public" : "private"}`,
      data: { propertyId: id, isPublic },
    });
  } catch (error) {
    console.error("Set visibility failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to set property visibility",
      error: error.message,
    });
  }
};

/* ---------------------------
   OPERATION STATUS (mock)
---------------------------- */
const getOperationStatus = async (req, res) => {
  try {
    const { operationId } = req.params;
    return res.json({
      success: true,
      data: {
        operationId,
        status: "completed",
        timestamp: new Date().toISOString(),
        message: "Operation completed successfully",
      },
    });
  } catch (error) {
    console.error("Get operation status failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get operation status",
      error: error.message,
    });
  }
};

// Bulk assign/unassign executive for rental or sale properties
const bulkAssignExecutive = async (req, res) => {
  try {
    const { propertyIds, executiveId, isRental } = req.body;
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No property IDs provided' });
    }
    const table = isRental ? 'rental_properties' : 'properties';
    const placeholders = propertyIds.map(() => '?').join(',');
    const db = require('../config/database');
    if (executiveId !== null && executiveId !== undefined) {
      await db.query(
        `UPDATE ${table} SET assigned_to = ? WHERE id IN (${placeholders})`,
        [executiveId, ...propertyIds]
      );
    } else {
      await db.query(
        `UPDATE ${table} SET assigned_to = NULL WHERE id IN (${placeholders})`,
        [...propertyIds]
      );
    }
    return res.json({
      success: true,
      message: `Executive ${executiveId ? 'assigned' : 'unassigned'} for ${propertyIds.length} properties`,
      data: { affected: propertyIds.length }
    });
  } catch (err) {
    console.error('bulkAssignExecutive error:', err);
    return res.status(500).json({ success: false, message: 'Failed to assign executive' });
  }
};

module.exports = {
  // bulk
  bulkUpdateStatus,
  bulkMarkPublic,
  bulkMarkPrivate,
  bulkSetVisibility,
  bulkDelete,
  bulkExport,
  bulkAssignExecutive,

  // single
  markPublic,
  markPrivate,
  setVisibility,

  // misc
  getOperationStatus,
};
