// controllers/sellerBundleController.js
const pool = require("../config/database");

const getSellerBundle = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[seller]] = await pool.query("SELECT * FROM sellers WHERE id = ?", [id]);
    if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });

    const [coSellers] = await pool.query(
      "SELECT id, name, phone, email, relation FROM seller_cosellers WHERE seller_id = ?",
      [id]
    );

    const [properties] = await pool.query(
      "SELECT * FROM my_properties WHERE seller_id = ? ORDER BY id DESC",
      [id]
    );

    res.json({ success: true, data: { seller, coSellers, properties } });
  } catch (err) {
    console.error("getSellerBundle error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch bundle" });
  }
};

module.exports = { getSellerBundle };
