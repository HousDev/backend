const db = require("../config/database");

class PropertyStatusHistory {
  // ---------------------------
  // Create New Status History Entry
  // ---------------------------
  static async create(data) {
    const [result] = await db.execute(
      `INSERT INTO property_status_history
      (
        property_id, status, previous_status, remarks,
        update_reason, effective_date, updated_by,
        notify_parties, price_adjustment,
        new_price, previous_price
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.property_id,
        data.status,
        data.previous_status || null,
        data.remarks,
        data.update_reason,
        data.effective_date || null,
        data.updated_by,
        data.notify_parties || false,
        data.price_adjustment || false,
        data.new_price || null,
        data.previous_price || null,
      ]
    );
    return result.insertId;
  }

  // ---------------------------
  // Get All History for a Property
  // ---------------------------
  static async getByPropertyId(propertyId) {
    const [rows] = await db.execute(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY timestamp DESC",
      [propertyId]
    );
    return rows;
  }

  // ---------------------------
  // Get Single History Record
  // ---------------------------
  static async getById(id) {
    const [rows] = await db.execute(
      "SELECT * FROM property_status_history WHERE id = ?",
      [id]
    );
    return rows[0] || null;
  }

  // ---------------------------
  // Update a History Record
  // ---------------------------
  static async update(id, data) {
    const [result] = await db.execute(
      `UPDATE property_status_history SET
        status = ?, previous_status = ?, remarks = ?,
        update_reason = ?, effective_date = ?, updated_by = ?,
        notify_parties = ?, price_adjustment = ?,
        new_price = ?, previous_price = ?
      WHERE id = ?`,
      [
        data.status,
        data.previous_status || null,
        data.remarks,
        data.update_reason,
        data.effective_date || null,
        data.updated_by,
        data.notify_parties || false,
        data.price_adjustment || false,
        data.new_price || null,
        data.previous_price || null,
        id,
      ]
    );
    return result.affectedRows;
  }

  // ---------------------------
  // Delete History Record
  // ---------------------------
  static async delete(id) {
    const [result] = await db.execute(
      "DELETE FROM property_status_history WHERE id = ?",
      [id]
    );
    return result.affectedRows;
  }

  // ---------------------------
  // Delete All History of a Property
  // ---------------------------
  static async deleteByPropertyId(propertyId) {
    const [result] = await db.execute(
      "DELETE FROM property_status_history WHERE property_id = ?",
      [propertyId]
    );
    return result.affectedRows;
  }

  // ---------------------------
  // Update Property Status + Create History (FIXED FOR my_properties table)
  // ---------------------------
  static async updatePropertyStatus(propertyId, data) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Get current property details from my_properties table
      const [currentProperty] = await connection.execute(
        "SELECT status, budget FROM my_properties WHERE id = ?", // ⬅️ my_properties table, budget column
        [propertyId]
      );

      if (currentProperty.length === 0) {
        throw new Error("Property not found");
      }

      const current = currentProperty[0];

      // 2. Update property status in my_properties table (and budget if needed)
      let updateQuery = "UPDATE my_properties SET status = ?"; // ⬅️ my_properties table
      let updateParams = [data.status];

      if (data.priceAdjustment && data.newPrice) {
        updateQuery += ", budget = ?"; // ⬅️ budget column instead of price
        updateParams.push(data.newPrice);
      }

      updateQuery += " WHERE id = ?";
      updateParams.push(propertyId);

      await connection.execute(updateQuery, updateParams);

      // 3. Create history record
      const historyData = {
        property_id: propertyId,
        status: data.status,
        previous_status: current.status,
        remarks: data.remarks,
        update_reason: data.updateReason,
        effective_date: data.effectiveDate || null,
        updated_by: data.updatedBy,
        notify_parties: data.notifyParties || false,
        price_adjustment: data.priceAdjustment || false,
        new_price: data.newPrice || null,
        previous_price: current.budget || null, // ⬅️ budget instead of price
      };

      // Use the create method with the connection
      const [result] = await connection.execute(
        `INSERT INTO property_status_history
        (
          property_id, status, previous_status, remarks,
          update_reason, effective_date, updated_by,
          notify_parties, price_adjustment,
          new_price, previous_price
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          historyData.property_id,
          historyData.status,
          historyData.previous_status,
          historyData.remarks,
          historyData.update_reason,
          historyData.effective_date,
          historyData.updated_by,
          historyData.notify_parties,
          historyData.price_adjustment,
          historyData.new_price,
          historyData.previous_price,
        ]
      );

      const historyId = result.insertId;

      await connection.commit();

      // Get the created history record
      const [createdHistory] = await connection.execute(
        "SELECT * FROM property_status_history WHERE id = ?",
        [historyId]
      );

      return {
        property: {
          id: propertyId,
          status: data.status,
          ...(data.priceAdjustment && data.newPrice
            ? { budget: data.newPrice }
            : {}), // ⬅️ budget instead of price
        },
        statusHistory: createdHistory[0],
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = PropertyStatusHistory;
