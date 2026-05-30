const axios = require("axios");
const XLSX = require("xlsx");

/**
 * Import data from a public Google Sheet
 */
exports.importGoogleSheet = async (req, res) => {
  try {
    const { sheetUrl } = req.body;

    if (!sheetUrl) {
      return res.status(400).json({
        success: false,
        error: "Sheet URL is required",
      });
    }

    // Extract sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return res.status(400).json({
        success: false,
        error: "Invalid Google Sheet URL",
      });
    }

    const sheetId = sheetIdMatch[1];

    // Extract gid (sheet tab) if present
    const gidMatch = sheetUrl.match(/[?&]gid=(\d+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";

    // Google Sheets export URL (CSV format)
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;

    console.log(`[Google Sheets] Fetching from: ${exportUrl}`);

    // Fetch from Google (backend to backend - NO CORS issue)
    const response = await axios.get(exportUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/csv,application/csv,text/plain,*/*",
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    // Parse CSV to JSON using XLSX
    const workbook = XLSX.read(response.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No data found in the Google Sheet",
      });
    }

    console.log(`[Google Sheets] Successfully imported ${rows.length} rows`);

    res.json({
      success: true,
      rows,
      total: rows.length,
      message: `Successfully imported ${rows.length} rows`,
    });
  } catch (error) {
    console.error("[Google Sheets] Import error:", error.message);

    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error:
          "Sheet not found. Please check the URL and make sure the sheet exists.",
      });
    }

    if (error.response?.status === 403) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied. Please make sure your Google Sheet is public: 'Anyone with the link can view'",
      });
    }

    if (error.code === "ECONNABORTED") {
      return res.status(504).json({
        success: false,
        error: "Request timeout. Please try again.",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to import from Google Sheet",
    });
  }
};

/**
 * Validate if a Google Sheet URL is accessible
 */
exports.validateGoogleSheet = async (req, res) => {
  try {
    const { sheetUrl } = req.body;

    if (!sheetUrl) {
      return res.status(400).json({
        success: false,
        error: "Sheet URL is required",
      });
    }

    const sheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return res.status(400).json({
        success: false,
        error: "Invalid Google Sheet URL format",
      });
    }

    const sheetId = sheetIdMatch[1];
    const gidMatch = sheetUrl.match(/[?&]gid=(\d+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;

    const response = await axios.head(exportUrl, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    res.json({
      success: true,
      accessible: response.status === 200,
      message: "Sheet is accessible",
    });
  } catch (error) {
    console.error("[Google Sheets] Validation error:", error.message);

    let message = "Sheet is not accessible";
    if (error.response?.status === 403) {
      message =
        "Sheet is not public. Please set sharing to 'Anyone with link can view'";
    } else if (error.response?.status === 404) {
      message = "Sheet not found. Please check the URL";
    }

    res.json({
      success: false,
      accessible: false,
      error: message,
    });
  }
};
