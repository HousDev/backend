const db = require('../config/database');

const rentLeaseModel = {
  // Ensure tables exist safely
  initTables: async () => {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS tenant_leases (
          id INT AUTO_INCREMENT PRIMARY KEY,
          booking_id VARCHAR(100) NOT NULL UNIQUE,
          tenant_id INT NOT NULL,
          owner_id INT NOT NULL,
          property_id INT NOT NULL,
          monthly_rent DECIMAL(10,2) NOT NULL,
          rent_due_day INT DEFAULT 5,
          owner_upi_id VARCHAR(150) DEFAULT NULL,
          owner_qr_code_url TEXT DEFAULT NULL,
          lease_start_date DATE DEFAULT NULL,
          lease_status ENUM('ACTIVE', 'EXPIRED', 'TERMINATED') DEFAULT 'ACTIVE',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX (tenant_id),
          INDEX (owner_id),
          INDEX (property_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS rent_payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          lease_id INT NOT NULL,
          tenant_id INT NOT NULL,
          owner_id INT NOT NULL,
          invoice_no VARCHAR(100) UNIQUE NOT NULL,
          billing_month DATE NOT NULL,
          due_date DATE NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          payment_status ENUM('DUE', 'CLAIMED', 'VERIFIED', 'ISSUE') DEFAULT 'DUE',
          utr_number VARCHAR(100) DEFAULT NULL,
          payment_notes TEXT DEFAULT NULL,
          payment_method VARCHAR(50) DEFAULT 'UPI',
          paid_at DATETIME DEFAULT NULL,
          verified_at DATETIME DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_lease_month (lease_id, billing_month),
          INDEX (lease_id),
          INDEX (tenant_id),
          INDEX (owner_id),
          INDEX (payment_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (err) {
      console.warn('initTables notice:', err.message);
    }
  },

  createOrUpdateLease: async (data) => {
    try {
      const {
        booking_id,
        tenant_id,
        owner_id,
        property_id,
        monthly_rent,
        rent_due_day = 5,
        owner_upi_id = null,
        owner_qr_code_url = null,
        lease_start_date = new Date().toISOString().split('T')[0],
      } = data;

      const sql = `
        INSERT INTO tenant_leases 
        (booking_id, tenant_id, owner_id, property_id, monthly_rent, rent_due_day, owner_upi_id, owner_qr_code_url, lease_start_date, lease_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        ON DUPLICATE KEY UPDATE
          monthly_rent = VALUES(monthly_rent),
          rent_due_day = VALUES(rent_due_day),
          owner_upi_id = VALUES(owner_upi_id),
          owner_qr_code_url = VALUES(owner_qr_code_url),
          lease_status = 'ACTIVE',
          updated_at = NOW()
      `;

      const [res] = await db.query(sql, [
        booking_id,
        tenant_id,
        owner_id,
        property_id,
        monthly_rent,
        rent_due_day,
        owner_upi_id,
        owner_qr_code_url,
        lease_start_date,
      ]);

      const [rows] = await db.query('SELECT * FROM tenant_leases WHERE booking_id = ? LIMIT 1', [booking_id]);
      return rows[0] || null;
    } catch (err) {
      console.error('createOrUpdateLease error:', err.message);
      return null;
    }
  },

  getLeaseByBookingId: async (bookingId) => {
    try {
      const cleanId = String(bookingId || '').trim();
      const [rows] = await db.query('SELECT * FROM tenant_leases WHERE booking_id = ? OR id = ? LIMIT 1', [cleanId, cleanId]);
      return rows[0] || null;
    } catch (err) {
      console.warn('getLeaseByBookingId error:', err.message);
      return null;
    }
  },

  getLeaseByTenantId: async (tenantId) => {
    try {
      const cleanId = String(tenantId || '').trim();
      const [rows] = await db.query('SELECT * FROM tenant_leases WHERE tenant_id = ? AND lease_status = "ACTIVE" ORDER BY id DESC LIMIT 1', [cleanId]);
      return rows[0] || null;
    } catch (err) {
      console.warn('getLeaseByTenantId error:', err.message);
      return null;
    }
  },

  getLeaseByOwnerId: async (ownerId) => {
    try {
      const cleanId = String(ownerId || '').trim();
      const [rows] = await db.query('SELECT * FROM tenant_leases WHERE owner_id = ? ORDER BY id DESC', [cleanId]);
      return rows;
    } catch (err) {
      console.warn('getLeaseByOwnerId error:', err.message);
      return [];
    }
  },
};

module.exports = rentLeaseModel;
