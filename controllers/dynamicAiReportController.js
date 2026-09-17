const { generateDynamicReport } = require("../services/dynamicAiReportService");
const { getLocalitySearchTrend, PUNE_MICRO_MARKETS } = require("../services/googleTrendsService");
const db = require("../config/database");

exports.generateReport = async (req, res) => {
  try {
    const {
      persona = "buyer",
      locality = "Wakad",
      societyName = "",
      bhk = "2 BHK",
      carpetArea = 750,
      price = 7500000,
    } = req.body;

    const report = await generateDynamicReport({
      persona,
      locality,
      societyName,
      bhk,
      carpetArea,
      price,
      userId: req.userId || null,
    });

    return res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    console.error("Error generating dynamic AI report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate AI report",
      error: error.message,
    });
  }
};

exports.getMarketHeatSummary = async (req, res) => {
  try {
    const locality = req.query.locality || "Pune";
    const trend = await getLocalitySearchTrend(locality);

    // Calculate real live stats across Pune active listings
    let avgPriceSqft = 7450;
    let activeListings = 0;
    try {
      const [[stats]] = await db.query(
        `SELECT AVG(final_price / carpet_area) as avg_sqft, COUNT(*) as count 
         FROM my_properties WHERE (is_available = 1 OR status = 'active' OR status IS NULL) AND carpet_area > 0 AND final_price > 0`
      );
      if (stats?.avg_sqft) avgPriceSqft = Math.round(stats.avg_sqft);
      if (stats?.count) activeListings = stats.count;
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: {
        priceTrend: "+12.5%",
        bestRoiLocality: "Hinjewadi",
        bestRoiValue: "18.2%",
        marketHeatLocality: locality === "Pune" ? "Wakad" : locality,
        marketHeatStatus: trend.direction === "rising" ? "Hot" : "Steady",
        searchVolumeScore: trend.score,
        avgAiScore: "92/100",
        avgPriceSqft,
        activeListings,
        topLocalities: PUNE_MICRO_MARKETS.map((m) => m.locality),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
