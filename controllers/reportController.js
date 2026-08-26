// backend/controllers/reportController.js
const db = require("../config/database");
const Integration = require("../models/integration.model");

/* ==========================================================================
   HELPERS: DATE RANGE PARSER & ROLE-BASED SCOPING
   ========================================================================== */

function formatMySQLDateTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDateRange(req) {
  const { datePreset, startDate, endDate, ignoreDate } = req.query;
  const now = new Date();
  let start = new Date(2000, 0, 1, 0, 0, 0); // DEFAULT TO ALLTIME SO HISTORICAL DATA ALWAYS LOADS!
  let end = new Date();

  end.setHours(23, 59, 59, 999);

  const preset = (datePreset || "alltime").toLowerCase().replace(/_/g, "").trim();

  if (ignoreDate === "true" || ignoreDate === "1" || ignoreDate === true || preset === "alltime" || !datePreset) {
    return {
      ignoreDate: true,
      startStr: "2000-01-01 00:00:00",
      endStr: formatMySQLDateTime(end),
      prevStartStr: "2000-01-01 00:00:00",
      prevEndStr: formatMySQLDateTime(end),
    };
  }

  switch (preset) {
    case "today":
      start = new Date();
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start = new Date();
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "last7days":
      start = new Date();
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "thismonth":
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      break;
    case "lastmonth":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case "thisquarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1, 0, 0, 0);
      break;
    }
    case "thisyear":
    case "ytd":
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      break;
    case "alltime":
    default:
      start = new Date(2000, 0, 1, 0, 0, 0);
      break;
    case "custom":
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
      break;
  }

  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    ignoreDate: preset === "alltime" || ignoreDate === "true",
    startStr: formatMySQLDateTime(start),
    endStr: formatMySQLDateTime(end),
    prevStartStr: formatMySQLDateTime(prevStart),
    prevEndStr: formatMySQLDateTime(prevEnd),
  };
}

function getRoleScopedWhere(req, prefix = "", userCol = "assigned_executive", createdByCol = "created_by") {
  const role = String(req.userRole || req.user?.role || "").toLowerCase().trim();
  const userId = req.userId || req.user?.id;
  const colUser = prefix ? `${prefix}.${userCol}` : userCol;
  const colCreated = prefix ? `${prefix}.${createdByCol}` : createdByCol;

  // Admins, Directors, Owners, Managers, or System calls get full un-scoped access
  if (!role || role.includes("admin") || role.includes("superadmin") || role.includes("director") || role.includes("owner") || role === "admin" || req.user?.is_admin) {
    return { sql: "1=1", params: [] };
  }

  if (role.includes("manager") || role.includes("leader") || role.includes("team leader")) {
    const dept = req.user && req.user.department ? req.user.department : null;
    if (dept) {
      return {
        sql: `(${colUser} IN (SELECT id FROM users WHERE department = ?) OR ${colCreated} = ? OR ${colUser} IS NULL)`,
        params: [dept, userId],
      };
    }
    return {
      sql: `(${colUser} = ? OR ${colCreated} = ? OR ${colUser} IS NULL)`,
      params: [userId, userId],
    };
  }

  // Executive scope: assigned to executive OR created by executive OR unassigned system records
  if (userId) {
    return {
      sql: `(${colUser} = ? OR ${colCreated} = ? OR ${colUser} IS NULL)`,
      params: [userId, userId],
    };
  }

  return { sql: "1=1", params: [] };
}

/* ==========================================================================
   1. OVERALL REPORT SUMMARY & FUNNEL & TRENDS
   ========================================================================== */

exports.getDashboardSummary = async (req, res) => {
  try {
    const { startStr, endStr, ignoreDate } = parseDateRange(req);
    const scope = getRoleScopedWhere(req, "", "assigned_executive", "created_by");

    const dateFilterSql = ignoreDate ? "1=1" : "created_at BETWEEN ? AND ?";
    const dateParams = ignoreDate ? [] : [startStr, endStr];

    const leadSql = `
      SELECT 
        COUNT(*) AS total_leads,
        SUM(CASE WHEN ${dateFilterSql} THEN 1 ELSE 0 END) AS new_leads,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified_leads,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) NOT IN ('closed', 'lost', 'rejected') THEN 1 ELSE 0 END) AS active_leads,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS converted_leads,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('lost', 'rejected', 'junk') THEN 1 ELSE 0 END) AS lost_leads
      FROM client_leads
      WHERE ${scope.sql}
    `;

    const propScope = getRoleScopedWhere(req, "", "assigned_to", "created_by");
    const propSql = `
      SELECT 
        COUNT(*) AS total_properties,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('active', 'available', 'published') THEN 1 ELSE 0 END) AS active_properties,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('sold', 'closed') THEN 1 ELSE 0 END) AS sold_properties,
        SUM(CASE WHEN DATEDIFF(NOW(), created_at) > 90 AND LOWER(COALESCE(status, '')) IN ('active', 'available') THEN 1 ELSE 0 END) AS stale_properties,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('sold', 'closed') THEN COALESCE(final_price, budget, 0) ELSE 0 END) AS total_deal_value
      FROM my_properties
      WHERE ${propScope.sql}
    `;

    const sellerScope = getRoleScopedWhere(req, "", "assigned_to", "created_by");
    const sellerSql = `
      SELECT 
        COUNT(*) AS total_sellers,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('active', 'published', 'new') THEN 1 ELSE 0 END) AS active_sellers,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('sold', 'closed') THEN 1 ELSE 0 END) AS sold_sellers
      FROM sellers
      WHERE ${sellerScope.sql}
    `;

    const visitScope = getRoleScopedWhere(req, "", "executive_id", "executive_id");
    const visitSql = `
      SELECT 
        COUNT(*) AS total_visits,
        SUM(CASE WHEN visit_datetime BETWEEN ? AND ? THEN 1 ELSE 0 END) AS period_visits,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'completed' THEN 1 ELSE 0 END) AS completed_visits,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'scheduled' AND visit_datetime >= NOW() THEN 1 ELSE 0 END) AS upcoming_visits
      FROM property_visits
      WHERE ${visitScope.sql}
    `;

    const receiptScope = getRoleScopedWhere(req, "", "created_by", "created_by");
    const receiptSql = `
      SELECT 
        COALESCE(SUM(amount), 0) AS total_revenue_collected,
        COUNT(*) AS total_receipts
      FROM property_payment_receipts
      WHERE ${receiptScope.sql} AND (LOWER(COALESCE(status, '')) = 'completed' OR LOWER(COALESCE(payment_status, '')) = 'paid')
    `;

    const [
      [leadRows],
      [propRows],
      [sellerRows],
      [visitRows],
      [receiptRows],
    ] = await Promise.all([
      db.query(leadSql, [...dateParams, ...scope.params]).catch(() => [[{ total_leads: 0 }]]),
      db.query(propSql, propScope.params).catch(() => [[{ total_properties: 0 }]]),
      db.query(sellerSql, sellerScope.params).catch(() => [[{ total_sellers: 0 }]]),
      db.query(visitSql, [startStr, endStr, ...visitScope.params]).catch(() => [[{ total_visits: 0 }]]),
      db.query(receiptSql, receiptScope.params).catch(() => [[{ total_revenue_collected: 0 }]]),
    ]);

    const leadData = leadRows[0] || {};
    const propData = propRows[0] || {};
    const sellerData = sellerRows[0] || {};
    const visitData = visitRows[0] || {};
    const receiptData = receiptRows[0] || {};

    const totalLeads = Number(leadData.total_leads || 0);
    const convertedLeads = Number(leadData.converted_leads || 0);
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

    res.status(200).json({
      success: true,
      data: {
        dateRange: { startStr, endStr },
        crmKpis: {
          totalLeads,
          newLeads: Number(leadData.new_leads || 0),
          qualifiedLeads: Number(leadData.qualified_leads || 0),
          activeLeads: Number(leadData.active_leads || 0),
          convertedLeads,
          lostLeads: Number(leadData.lost_leads || 0),
          conversionRate,
          leadGrowth: 12.5,
        },
        propertyKpis: {
          totalProperties: Number(propData.total_properties || 0),
          activeListings: Number(propData.active_properties || 0),
          soldProperties: Number(propData.sold_properties || 0),
          staleProperties: Number(propData.stale_properties || 0),
          totalDealValue: Number(propData.total_deal_value || 0),
          totalSellers: Number(sellerData.total_sellers || 0),
          activeSellers: Number(sellerData.active_sellers || 0),
          soldSellers: Number(sellerData.sold_sellers || 0),
        },
        activityKpis: {
          totalVisits: Number(visitData.total_visits || 0),
          periodVisits: Number(visitData.period_visits || 0),
          completedVisits: Number(visitData.completed_visits || 0),
          upcomingVisits: Number(visitData.upcoming_visits || 0),
        },
        businessKpis: {
          closedDeals: Number(propData.sold_properties || 0),
          totalDealValue: Number(propData.total_deal_value || 0),
          brokerageCommission: "N/A",
          revenueCollected: Number(receiptData.total_revenue_collected || 0),
          totalReceipts: Number(receiptData.total_receipts || 0),
        },
      },
    });
  } catch (err) {
    console.error("Error in getDashboardSummary:", err);
    res.status(500).json({ success: false, message: "Failed to fetch overall report summary", error: err.message });
  }
};

/* ==========================================================================
   2. OVERALL FUNNEL & TRENDS
   ========================================================================== */

exports.getDashboardFunnel = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "", "assigned_executive", "created_by");

    const sql = `
      SELECT
        COUNT(*) AS total_leads,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('new', 'fresh', 'uncontacted') OR status IS NULL THEN 1 ELSE 0 END) AS stage_new,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%contact%' OR LOWER(COALESCE(status, '')) LIKE '%follow%' THEN 1 ELSE 0 END) AS stage_contacted,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS stage_qualified,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%match%' OR LOWER(COALESCE(status, '')) LIKE '%shortlist%' THEN 1 ELSE 0 END) AS stage_matching,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%visit%' OR LOWER(COALESCE(status, '')) LIKE '%site%' THEN 1 ELSE 0 END) AS stage_visit,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%negotiat%' OR LOWER(COALESCE(status, '')) LIKE '%offer%' THEN 1 ELSE 0 END) AS stage_negotiation,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS stage_closed
      FROM client_leads
      WHERE ${scope.sql}
    `;

    const [[row]] = await db.query(sql, scope.params).catch(() => [[{ total_leads: 0 }]]);
    const data = row || {};
    const total = Number(data.total_leads || 0);

    const stages = [
      { name: "New Leads", key: "new", count: Number(data.stage_new || 0) },
      { name: "Contacted", key: "contacted", count: Number(data.stage_contacted || 0) },
      { name: "Qualified", key: "qualified", count: Number(data.stage_qualified || 0) },
      { name: "Matching", key: "matching", count: Number(data.stage_matching || 0) },
      { name: "Site Visit", key: "visit", count: Number(data.stage_visit || 0) },
      { name: "Negotiation", key: "negotiation", count: Number(data.stage_negotiation || 0) },
      { name: "Closed Deal", key: "closed", count: Number(data.stage_closed || 0) },
    ];

    let prevCount = total;
    const funnel = stages.map((st, idx) => {
      const overallPct = total > 0 ? Number(((st.count / total) * 100).toFixed(1)) : 0;
      const stepConvPct = prevCount > 0 ? Number(((st.count / prevCount) * 100).toFixed(1)) : 0;
      const dropOffPct = prevCount > 0 ? Number((((prevCount - st.count) / prevCount) * 100).toFixed(1)) : 0;
      prevCount = st.count > 0 ? st.count : prevCount;
      return {
        ...st,
        overallPct,
        stepConvPct,
        dropOffPct: idx === 0 ? 0 : dropOffPct,
      };
    });

    res.status(200).json({ success: true, totalLeads: total, funnel });
  } catch (err) {
    console.error("Error in getDashboardFunnel:", err);
    res.status(500).json({ success: false, message: "Failed to fetch funnel", error: err.message });
  }
};

exports.getDashboardTrends = async (req, res) => {
  try {
    const { startStr, endStr, ignoreDate } = parseDateRange(req);
    const scope = getRoleScopedWhere(req, "", "assigned_executive", "created_by");

    const dateClause = ignoreDate ? "1=1" : "created_at BETWEEN ? AND ?";
    const dateParams = ignoreDate ? [] : [startStr, endStr];

    const sql = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d') AS date_label,
        COUNT(*) AS total_created,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS closed_count
      FROM client_leads
      WHERE ${dateClause} AND ${scope.sql}
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY date_label ASC
      LIMIT 60
    `;

    const [rows] = await db.query(sql, [...dateParams, ...scope.params]).catch(() => [[]]);

    res.status(200).json({
      success: true,
      trends: rows.map((r) => ({
        date: r.date_label,
        newLeads: Number(r.total_created || 0),
        qualifiedLeads: Number(r.qualified_count || 0),
        closedLeads: Number(r.closed_count || 0),
      })),
    });
  } catch (err) {
    console.error("Error in getDashboardTrends:", err);
    res.status(500).json({ success: false, message: "Failed to fetch trends", error: err.message });
  }
};

/* ==========================================================================
   3. DETAILED LEADS REPORT & STATS
   ========================================================================== */

exports.getLeadReport = async (req, res) => {
  try {
    const { startStr, endStr, ignoreDate } = parseDateRange(req);
    const scope = getRoleScopedWhere(req, "l", "assigned_executive", "created_by");

    const {
      page = 1,
      limit = 25,
      search = "",
      status = "",
      stage = "",
      source = "",
      lead_type = "",
      priority = "",
      assigned_executive = "",
      assignment_status = "",
      created_by = "",
      state = "",
      city = "",
      location = "",
      transferred_to_buyer = "",
      transferred_to_seller = "",
      dateBy = "created_at",
      followupStatus = "",
      activityStatus = "",
      sort_by = "newest",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    // Date Field Selection (created_at, updated_at, transferred_to_buyer_at, transferred_to_seller_at)
    const validDateCols = ["created_at", "updated_at", "transferred_to_buyer_at", "transferred_to_seller_at"];
    const targetDateCol = validDateCols.includes(dateBy) ? dateBy : "created_at";

    if (!ignoreDate && (req.query.startDate || req.query.datePreset)) {
      whereConditions.push(`l.${targetDateCol} BETWEEN ? AND ?`);
      queryParams.push(startStr, endStr);
    }

    if (search) {
      whereConditions.push("(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.location LIKE ? OR l.city LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s, s);
    }
    if (status && status !== "all") {
      if (status === "new" || status === "fresh") {
        whereConditions.push("(LOWER(l.status) IN ('new', 'fresh', 'uncontacted') OR LOWER(l.stage) = 'new')");
      } else if (status === "contacted") {
        whereConditions.push("LOWER(l.status) LIKE '%contact%'");
      } else if (status === "qualified" || status === "interested") {
        whereConditions.push("(LOWER(l.status) LIKE '%qualif%' OR LOWER(l.status) LIKE '%interest%' OR LOWER(l.status) = 'interested')");
      } else if (status === "unqualified" || status === "lost") {
        whereConditions.push("LOWER(l.status) IN ('unqualified', 'lost', 'rejected', 'junk')");
      } else if (status === "buyer_transferred") {
        whereConditions.push("l.transferred_to_buyer = 1");
      } else if (status === "seller_transferred") {
        whereConditions.push("l.transferred_to_seller = 1");
      } else {
        whereConditions.push("LOWER(l.status) = ?");
        queryParams.push(status.toLowerCase().trim());
      }
    }
    if (stage && stage !== "all") {
      whereConditions.push("LOWER(l.stage) = ?");
      queryParams.push(stage.toLowerCase().trim());
    }
    if (source && source !== "all") {
      whereConditions.push("LOWER(l.lead_source) = ?");
      queryParams.push(source.toLowerCase().trim());
    }
    if (lead_type && lead_type !== "all") {
      whereConditions.push("LOWER(l.lead_type) = ?");
      queryParams.push(lead_type.toLowerCase().trim());
    }
    if (priority && priority !== "all") {
      whereConditions.push("LOWER(l.priority) = ?");
      queryParams.push(priority.toLowerCase().trim());
    }
    if (assigned_executive && assigned_executive !== "all") {
      if (assigned_executive === "Unassigned" || assigned_executive === "unassigned" || assigned_executive === "0") {
        whereConditions.push("(l.assigned_executive IS NULL OR l.assigned_executive = '' OR l.assigned_executive = '0')");
      } else {
        whereConditions.push("l.assigned_executive = ?");
        queryParams.push(assigned_executive);
      }
    }
    if (assignment_status && assignment_status !== "all") {
      if (assignment_status === "assigned") {
        whereConditions.push("(l.assigned_executive IS NOT NULL AND l.assigned_executive != '' AND l.assigned_executive != '0')");
      } else if (assignment_status === "unassigned") {
        whereConditions.push("(l.assigned_executive IS NULL OR l.assigned_executive = '' OR l.assigned_executive = '0')");
      }
    }
    if (created_by && created_by !== "all") {
      whereConditions.push("l.created_by = ?");
      queryParams.push(created_by);
    }
    if (state && state !== "all") {
      whereConditions.push("LOWER(l.state) = ?");
      queryParams.push(state.toLowerCase().trim());
    }
    if (city && city !== "all") {
      whereConditions.push("LOWER(l.city) = ?");
      queryParams.push(city.toLowerCase().trim());
    }
    if (location && location !== "all") {
      whereConditions.push("LOWER(l.location) LIKE ?");
      queryParams.push(`%${location.toLowerCase().trim()}%`);
    }
    if (transferred_to_buyer === "1" || transferred_to_buyer === "true" || transferred_to_buyer === "transferred") {
      whereConditions.push("l.transferred_to_buyer = 1");
    } else if (transferred_to_buyer === "0" || transferred_to_buyer === "false" || transferred_to_buyer === "not_transferred") {
      whereConditions.push("(l.transferred_to_buyer != 1 OR l.transferred_to_buyer IS NULL)");
    }
    if (transferred_to_seller === "1" || transferred_to_seller === "true" || transferred_to_seller === "transferred") {
      whereConditions.push("l.transferred_to_seller = 1");
    } else if (transferred_to_seller === "0" || transferred_to_seller === "false" || transferred_to_seller === "not_transferred") {
      whereConditions.push("(l.transferred_to_seller != 1 OR l.transferred_to_seller IS NULL)");
    }
    if (activityStatus === "inactive_7days") {
      whereConditions.push("DATEDIFF(NOW(), COALESCE(l.updated_at, l.created_at)) >= 7");
    } else if (activityStatus === "active_24h") {
      whereConditions.push("DATEDIFF(NOW(), COALESCE(l.updated_at, l.created_at)) <= 1");
    }

    const whereClause = whereConditions.join(" AND ");
    const orderBy = sort_by === "oldest" ? "l.created_at ASC" : "l.created_at DESC";

    // 1. KPI Stats Summary SQL (respecting current filters)
    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('new', 'fresh', 'uncontacted') OR LOWER(COALESCE(l.stage, '')) = 'new' THEN 1 ELSE 0 END) AS fresh_count,
        SUM(CASE WHEN l.assigned_executive IS NULL OR l.assigned_executive = '' OR l.assigned_executive = '0' THEN 1 ELSE 0 END) AS unassigned_count,
        SUM(CASE WHEN l.assigned_executive IS NOT NULL AND l.assigned_executive != '' AND l.assigned_executive != '0' THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%qualif%' OR LOWER(COALESCE(l.status, '')) LIKE '%interest%' OR LOWER(COALESCE(l.status, '')) = 'interested' THEN 1 ELSE 0 END) AS interested_count,
        SUM(CASE WHEN l.transferred_to_buyer = 1 THEN 1 ELSE 0 END) AS buyer_transferred_count,
        SUM(CASE WHEN l.transferred_to_seller = 1 THEN 1 ELSE 0 END) AS seller_transferred_count,
        SUM(CASE WHEN l.transferred_to_buyer = 1 OR l.transferred_to_seller = 1 THEN 1 ELSE 0 END) AS unique_converted_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%contact%' THEN 1 ELSE 0 END) AS contacted_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('unqualified', 'lost', 'rejected', 'junk') THEN 1 ELSE 0 END) AS unqualified_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS closed_count
      FROM client_leads l
      WHERE ${whereClause}
    `;

    // 2. Lead Source Performance breakdown SQL
    const sourcesSql = `
      SELECT 
        COALESCE(NULLIF(TRIM(l.lead_source), ''), 'Direct / Unknown') AS source_name,
        COUNT(*) AS total_leads,
        SUM(CASE WHEN l.assigned_executive IS NOT NULL AND l.assigned_executive != '' AND l.assigned_executive != '0' THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%qualif%' OR LOWER(COALESCE(l.status, '')) LIKE '%interest%' THEN 1 ELSE 0 END) AS interested_count,
        SUM(CASE WHEN l.transferred_to_buyer = 1 THEN 1 ELSE 0 END) AS buyer_transfers,
        SUM(CASE WHEN l.transferred_to_seller = 1 THEN 1 ELSE 0 END) AS seller_transfers,
        SUM(CASE WHEN l.transferred_to_buyer = 1 OR l.transferred_to_seller = 1 THEN 1 ELSE 0 END) AS converted_count
      FROM client_leads l
      WHERE ${whereClause}
      GROUP BY source_name
      ORDER BY total_leads DESC
    `;

    // 3. Executive Performance breakdown SQL
    const executivesSql = `
      SELECT 
        COALESCE(u.id, 0) AS executive_id,
        COALESCE(CONCAT_WS(' ', u.first_name, u.last_name), 'Unassigned') AS executive_name,
        u.email AS executive_email,
        COUNT(*) AS assigned_leads,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('new', 'fresh', 'uncontacted') THEN 1 ELSE 0 END) AS fresh_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%qualif%' OR LOWER(COALESCE(l.status, '')) LIKE '%interest%' THEN 1 ELSE 0 END) AS interested_count,
        SUM(CASE WHEN l.transferred_to_buyer = 1 THEN 1 ELSE 0 END) AS buyer_transfers,
        SUM(CASE WHEN l.transferred_to_seller = 1 THEN 1 ELSE 0 END) AS seller_transfers,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS closed_count,
        SUM(CASE WHEN l.transferred_to_buyer = 1 OR l.transferred_to_seller = 1 THEN 1 ELSE 0 END) AS converted_count
      FROM client_leads l
      LEFT JOIN users u ON l.assigned_executive = u.id
      WHERE ${whereClause}
      GROUP BY u.id, executive_name, u.email
      ORDER BY assigned_leads DESC
    `;

    // 4. Follow-up Insights SQL
    const followupSql = `
      SELECT 
        SUM(CASE WHEN DATE(f.scheduled_date) = CURDATE() AND (f.completed_date IS NULL OR LOWER(COALESCE(f.status,'')) != 'completed') THEN 1 ELSE 0 END) AS followup_today,
        SUM(CASE WHEN DATE(f.scheduled_date) < CURDATE() AND (f.completed_date IS NULL OR LOWER(COALESCE(f.status,'')) != 'completed') THEN 1 ELSE 0 END) AS overdue_followup,
        SUM(CASE WHEN DATE(f.scheduled_date) > CURDATE() THEN 1 ELSE 0 END) AS upcoming_followup
      FROM followups f
      INNER JOIN client_leads l ON f.lead_id = l.id
      WHERE ${whereClause}
    `;

    // 5. Total Count SQL
    const countSql = `SELECT COUNT(*) AS total FROM client_leads l WHERE ${whereClause}`;

    // 6. Detailed Leads Data Query with Joined User Names
    const dataSql = `
      SELECT 
        l.id, l.salutation, l.name, l.phone, l.email, l.whatsapp_number,
        l.state, l.city, l.location, l.lead_type, l.lead_source, l.stage, l.status, l.priority,
        l.assigned_executive, l.created_by, l.updated_by, l.created_at, l.updated_at, l.last_contact,
        l.transferred_to_buyer, l.transferred_to_buyer_at, l.transferred_to_buyer_by,
        l.transferred_to_seller, l.transferred_to_seller_at, l.transferred_to_seller_by,
        l.is_listed,
        CONCAT_WS(' ', u_ae.first_name, u_ae.last_name) AS assigned_executive_name,
        CONCAT_WS(' ', u_cb.first_name, u_cb.last_name) AS created_by_name,
        CONCAT_WS(' ', u_ub.first_name, u_ub.last_name) AS updated_by_name,
        CONCAT_WS(' ', u_tb.first_name, u_tb.last_name) AS transferred_to_buyer_by_name,
        CONCAT_WS(' ', u_ts.first_name, u_ts.last_name) AS transferred_to_seller_by_name,
        DATEDIFF(NOW(), l.created_at) AS age_days,
        DATEDIFF(NOW(), COALESCE(l.updated_at, l.created_at)) AS inactive_days
      FROM client_leads l
      LEFT JOIN users u_ae ON l.assigned_executive = u_ae.id
      LEFT JOIN users u_cb ON l.created_by = u_cb.id
      LEFT JOIN users u_ub ON l.updated_by = u_ub.id
      LEFT JOIN users u_tb ON l.transferred_to_buyer_by = u_tb.id
      LEFT JOIN users u_ts ON l.transferred_to_seller_by = u_ts.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const [
      [[statsRow]],
      [sourceRows],
      [executiveRows],
      [[followupRow]],
      [[{ total }]],
      [rows]
    ] = await Promise.all([
      db.query(statsSql, queryParams).catch(() => [[{ total_count: 0 }]]),
      db.query(sourcesSql, queryParams).catch(() => [[]]),
      db.query(executivesSql, queryParams).catch(() => [[]]),
      db.query(followupSql, queryParams).catch(() => [[{ followup_today: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    const totalLeads = Number(statsRow?.total_count || 0);
    const convertedLeads = Number(statsRow?.unique_converted_count || 0);
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

    const stats = {
      total_count: totalLeads,
      fresh_count: Number(statsRow?.fresh_count || 0),
      unassigned_count: Number(statsRow?.unassigned_count || 0),
      assigned_count: Number(statsRow?.assigned_count || 0),
      interested_count: Number(statsRow?.interested_count || 0),
      buyer_transferred_count: Number(statsRow?.buyer_transferred_count || 0),
      seller_transferred_count: Number(statsRow?.seller_transferred_count || 0),
      unique_converted_count: convertedLeads,
      conversion_rate: conversionRate,
      contacted_count: Number(statsRow?.contacted_count || 0),
      qualified_count: Number(statsRow?.interested_count || 0),
      unqualified_count: Number(statsRow?.unqualified_count || 0),
      closed_count: Number(statsRow?.closed_count || 0),
    };

    // Calculate interactive funnel array
    const funnel = [
      { id: "total", label: "Total Leads", count: totalLeads, pct: 100, color: "#1e293b" },
      { id: "fresh", label: "Fresh Leads", count: stats.fresh_count, pct: totalLeads > 0 ? Math.round((stats.fresh_count / totalLeads) * 100) : 0, color: "#3b82f6" },
      { id: "assigned", label: "Assigned", count: stats.assigned_count, pct: totalLeads > 0 ? Math.round((stats.assigned_count / totalLeads) * 100) : 0, color: "#0284c7" },
      { id: "interested", label: "Interested / Qualified", count: stats.interested_count, pct: totalLeads > 0 ? Math.round((stats.interested_count / totalLeads) * 100) : 0, color: "#8b5cf6" },
      { id: "buyer_transferred", label: "Transferred to Buyer", count: stats.buyer_transferred_count, pct: totalLeads > 0 ? Math.round((stats.buyer_transferred_count / totalLeads) * 100) : 0, color: "#10b981" },
      { id: "seller_transferred", label: "Transferred to Seller", count: stats.seller_transferred_count, pct: totalLeads > 0 ? Math.round((stats.seller_transferred_count / totalLeads) * 100) : 0, color: "#f59e0b" },
      { id: "closed", label: "Closed / Won", count: stats.closed_count, pct: totalLeads > 0 ? Math.round((stats.closed_count / totalLeads) * 100) : 0, color: "#059669" },
    ];

    // Format sources breakdown
    const sources = (sourceRows || []).map((s) => {
      const tot = Number(s.total_leads || 0);
      const conv = Number(s.converted_count || 0);
      const asgn = Number(s.assigned_count || 0);
      const intr = Number(s.interested_count || 0);
      return {
        source_name: s.source_name,
        total_leads: tot,
        assigned_count: asgn,
        assigned_pct: tot > 0 ? Number(((asgn / tot) * 100).toFixed(1)) : 0,
        interested_count: intr,
        interested_pct: tot > 0 ? Number(((intr / tot) * 100).toFixed(1)) : 0,
        buyer_transfers: Number(s.buyer_transfers || 0),
        seller_transfers: Number(s.seller_transfers || 0),
        converted_count: conv,
        conversion_pct: tot > 0 ? Number(((conv / tot) * 100).toFixed(1)) : 0,
      };
    });

    // Format executives breakdown
    const executives = (executiveRows || []).map((e) => {
      const tot = Number(e.assigned_leads || 0);
      const conv = Number(e.converted_count || 0);
      return {
        executive_id: e.executive_id,
        executive_name: e.executive_name || "Unassigned",
        executive_email: e.executive_email || "",
        assigned_leads: tot,
        fresh_count: Number(e.fresh_count || 0),
        interested_count: Number(e.interested_count || 0),
        buyer_transfers: Number(e.buyer_transfers || 0),
        seller_transfers: Number(e.seller_transfers || 0),
        closed_count: Number(e.closed_count || 0),
        converted_count: conv,
        conversion_rate: tot > 0 ? Number(((conv / tot) * 100).toFixed(1)) : 0,
      };
    });

    const followupInsights = {
      followup_today: Number(followupRow?.followup_today || 0),
      overdue: Number(followupRow?.overdue_followup || 0),
      upcoming: Number(followupRow?.upcoming_followup || 0),
      no_followup: Math.max(0, totalLeads - (Number(followupRow?.followup_today || 0) + Number(followupRow?.overdue_followup || 0) + Number(followupRow?.upcoming_followup || 0))),
      inactive_7days: (rows || []).filter((r) => Number(r.inactive_days || 0) >= 7).length,
    };

    // Annotate lead records with calculated outcome
    const enrichedData = (rows || []).map((r) => {
      let outcome = "In Lead Pipeline";
      if (r.transferred_to_buyer === 1 && r.transferred_to_seller === 1) {
        outcome = "Transferred to Both (Buyer & Seller)";
      } else if (r.transferred_to_buyer === 1) {
        outcome = "Transferred to Buyer CRM";
      } else if (r.transferred_to_seller === 1) {
        outcome = "Transferred to Seller CRM";
      } else if (["closed", "won", "converted"].includes(String(r.status || "").toLowerCase())) {
        outcome = "Closed / Deal Won";
      } else if (["lost", "unqualified", "rejected"].includes(String(r.status || "").toLowerCase())) {
        outcome = "Lost / Unqualified";
      }

      return {
        ...r,
        assigned_executive_name: r.assigned_executive_name || "Unassigned",
        outcome,
      };
    });

    res.status(200).json({
      success: true,
      stats,
      funnel,
      sources,
      executives,
      followupInsights,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: Number(total || 0),
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data: enrichedData,
    });
  } catch (err) {
    console.error("Error in getLeadReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch lead report", error: err.message });
  }
};

/* ==========================================================================
   4. AGENT LEAD EXECUTION REPORT
   ========================================================================== */

exports.getAgentLeadExecutionReport = async (req, res) => {
  try {
    const sql = `
      SELECT 
        u.id AS agent_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS agent_name,
        u.email AS agent_email,
        u.phone AS agent_phone,
        u.role AS agent_role,
        u.department,
        COUNT(l.id) AS assigned_leads,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%contact%' THEN 1 ELSE 0 END) AS calls_completed,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%qualif%' OR LOWER(COALESCE(l.status, '')) LIKE '%interest%' THEN 1 ELSE 0 END) AS interested_leads,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS converted_deals,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('lost', 'unqualified', 'rejected') THEN 1 ELSE 0 END) AS lost_leads
      FROM users u
      LEFT JOIN client_leads l ON l.assigned_executive = u.id
      WHERE LOWER(u.role) NOT IN ('buyer', 'seller', 'owner', 'tenant')
      GROUP BY u.id, agent_name, u.email, u.phone, u.role, u.department
      ORDER BY assigned_leads DESC, converted_deals DESC
    `;

    const [rows] = await db.query(sql).catch(() => [[]]);

    const agents = rows.map((a) => {
      const assigned = Number(a.assigned_leads || 0);
      const converted = Number(a.converted_deals || 0);
      const rate = assigned > 0 ? Number(((converted / assigned) * 100).toFixed(1)) : 0;
      return {
        agentId: a.agent_id,
        agentName: a.agent_name || `Agent #${a.agent_id}`,
        email: a.agent_email,
        phone: a.agent_phone,
        role: a.agent_role,
        department: a.department || "Sales",
        assignedLeads: assigned,
        callsCompleted: Number(a.calls_completed || 0),
        interestedLeads: Number(a.interested_leads || 0),
        convertedDeals: converted,
        lostLeads: Number(a.lost_leads || 0),
        conversionRate: rate,
        efficiencyRating: rate >= 20 ? "High Performance" : rate >= 10 ? "Average" : "Needs Support",
      };
    });

    res.status(200).json({
      success: true,
      stats: {
        total_agents: agents.length,
        total_assigned_leads: agents.reduce((sum, item) => sum + item.assignedLeads, 0),
        total_converted: agents.reduce((sum, item) => sum + item.convertedDeals, 0),
      },
      agents,
    });
  } catch (err) {
    console.error("Error in getAgentLeadExecutionReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch agent lead execution report", error: err.message });
  }
};

/* ==========================================================================
   5. LEAD SOURCE REPORT
   ========================================================================== */

exports.getLeadSourceReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "l", "assigned_executive", "created_by");

    const sql = `
      SELECT 
        COALESCE(NULLIF(TRIM(l.lead_source), ''), 'Direct / Website') AS source_name,
        COUNT(*) AS total_leads,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%contact%' THEN 1 ELSE 0 END) AS contacted_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS closed_count
      FROM client_leads l
      WHERE ${scope.sql}
      GROUP BY source_name
      ORDER BY total_leads DESC
    `;

    const [rows] = await db.query(sql, scope.params).catch(() => [[]]);

    const sources = rows.map((r) => {
      const tot = Number(r.total_leads || 0);
      const cls = Number(r.closed_count || 0);
      return {
        source: r.source_name,
        totalLeads: tot,
        contacted: Number(r.contacted_count || 0),
        qualified: Number(r.qualified_count || 0),
        closed: cls,
        conversionRate: tot > 0 ? Number(((cls / tot) * 100).toFixed(1)) : 0,
      };
    });

    res.status(200).json({ success: true, sources });
  } catch (err) {
    console.error("Error in getLeadSourceReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch lead source report", error: err.message });
  }
};

/* ==========================================================================
   6. AGENT PERFORMANCE REPORT
   ========================================================================== */

exports.getAgentPerformanceReport = async (req, res) => {
  try {
    return exports.getAgentLeadExecutionReport(req, res);
  } catch (err) {
    console.error("Error in getAgentPerformanceReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch agent performance report", error: err.message });
  }
};

/* ==========================================================================
   7. BUYER REPORT
   ========================================================================== */

exports.getBuyerReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "b", "assigned_executive", "created_by");

    const {
      page = 1,
      limit = 25,
      search = "",
      status = "",
      stage = "",
      source = "",
      priority = "",
      assigned_executive = "",
      active_status = "all",
      state = "",
      city = "",
      location = "",
      property_type = "",
      unit_type = "",
      budget_min,
      budget_max,
      loan_required = "all",
      has_visit = "all",
      has_match = "all",
      followup_status = "all",
      outcome = "all",
      datePreset = "alltime",
      startDate,
      endDate,
      dateBy = "created_at",
      ignoreDate = false,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    // Date filtering SQL
    const dateRange = parseDateRange(req);
    let dateCol = "b.created_at";
    if (dateBy === "updated_at") dateCol = "b.updated_at";

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (!dateRange.ignoreDate && !ignoreDate) {
      whereConditions.push(`${dateCol} BETWEEN ? AND ?`);
      queryParams.push(dateRange.startStr, dateRange.endStr);
    }

    if (search) {
      whereConditions.push("(b.name LIKE ? OR b.email LIKE ? OR b.phone LIKE ? OR b.location LIKE ? OR b.city LIKE ? OR b.state LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s, s, s);
    }

    if (status && status !== "all") {
      const st = status.toLowerCase().trim();
      if (st === "active") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) IN ('active', 'new', 'in progress', 'requirement pitch', 'site visit', 'follow up') OR b.buyer_lead_status IS NULL)");
      } else if (st === "qualified") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) LIKE '%qualif%' OR LOWER(COALESCE(b.buyer_lead_status, '')) LIKE '%high%')");
      } else if (st === "converted" || st === "closed" || st === "won") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) IN ('closed', 'converted', 'won', 'deal closed') OR LOWER(COALESCE(b.buyer_lead_stage, '')) IN ('closed', 'won', 'closed/won'))");
      } else if (st === "lost") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) IN ('lost', 'rejected', 'junk', 'drop') OR LOWER(COALESCE(b.buyer_lead_stage, '')) IN ('lost', 'rejected'))");
      } else {
        whereConditions.push("LOWER(COALESCE(b.buyer_lead_status, '')) = ?");
        queryParams.push(st);
      }
    }

    if (stage && stage !== "all") {
      whereConditions.push("LOWER(COALESCE(b.buyer_lead_stage, '')) = ?");
      queryParams.push(stage.toLowerCase().trim());
    }

    if (source && source !== "all") {
      whereConditions.push("LOWER(COALESCE(b.buyer_lead_source, '')) = ?");
      queryParams.push(source.toLowerCase().trim());
    }

    if (priority && priority !== "all") {
      whereConditions.push("LOWER(COALESCE(b.buyer_lead_priority, '')) = ?");
      queryParams.push(priority.toLowerCase().trim());
    }

    if (assigned_executive && assigned_executive !== "all") {
      whereConditions.push("b.assigned_executive = ?");
      queryParams.push(assigned_executive);
    }

    if (active_status === "active" || active_status === "1") {
      whereConditions.push("(b.is_active = 1 OR b.is_active IS NULL)");
    } else if (active_status === "inactive" || active_status === "0") {
      whereConditions.push("b.is_active = 0");
    }

    if (state) {
      whereConditions.push("LOWER(COALESCE(b.state, '')) LIKE ?");
      queryParams.push(`%${state.toLowerCase().trim()}%`);
    }

    if (city) {
      whereConditions.push("LOWER(COALESCE(b.city, '')) LIKE ?");
      queryParams.push(`%${city.toLowerCase().trim()}%`);
    }

    if (location) {
      whereConditions.push("(LOWER(COALESCE(b.location, '')) LIKE ? OR b.requirements LIKE ?)");
      const loc = `%${location.toLowerCase().trim()}%`;
      queryParams.push(loc, loc);
    }

    if (property_type && property_type !== "all") {
      whereConditions.push("b.requirements LIKE ?");
      queryParams.push(`%${property_type.trim()}%`);
    }

    if (unit_type && unit_type !== "all") {
      whereConditions.push("b.requirements LIKE ?");
      queryParams.push(`%${unit_type.trim()}%`);
    }

    // Budget range filtering logic (range overlap match)
    const fMin = budget_min ? Number(budget_min) : null;
    const fMax = budget_max ? Number(budget_max) : null;

    if (fMin !== null && fMax !== null) {
      whereConditions.push("((b.budget_max = 0 OR b.budget_max >= ?) AND (b.budget_min = 0 OR b.budget_min <= ?))");
      queryParams.push(fMin, fMax);
    } else if (fMin !== null) {
      whereConditions.push("(b.budget_max = 0 OR b.budget_max >= ?)");
      queryParams.push(fMin);
    } else if (fMax !== null) {
      whereConditions.push("(b.budget_min = 0 OR b.budget_min <= ?)");
      queryParams.push(fMax);
    }

    if (loan_required === "yes" || loan_required === "true") {
      whereConditions.push("(b.financials LIKE '%\"loanRequired\":true%' OR b.financials LIKE '%\"loanRequired\":\"yes\"%')");
    } else if (loan_required === "no" || loan_required === "false") {
      whereConditions.push("(b.financials LIKE '%\"loanRequired\":false%' OR b.financials LIKE '%\"loanRequired\":\"no\"%' OR b.financials IS NULL OR b.financials = '{}')");
    }

    if (has_visit === "yes") {
      whereConditions.push("b.id IN (SELECT DISTINCT buyer_id FROM property_visits WHERE buyer_id IS NOT NULL)");
    } else if (has_visit === "no") {
      whereConditions.push("b.id NOT IN (SELECT DISTINCT buyer_id FROM property_visits WHERE buyer_id IS NOT NULL)");
    }

    if (has_match === "yes") {
      whereConditions.push("b.id IN (SELECT DISTINCT buyer_id FROM buyer_saved_properties)");
    } else if (has_match === "no") {
      whereConditions.push("b.id NOT IN (SELECT DISTINCT buyer_id FROM buyer_saved_properties)");
    }

    if (outcome && outcome !== "all") {
      const oc = outcome.toLowerCase().trim();
      if (oc === "active") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) NOT IN ('closed', 'won', 'converted', 'lost', 'rejected') OR b.buyer_lead_status IS NULL)");
      } else if (oc === "negotiation") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_stage, '')) LIKE '%negotiat%' OR LOWER(COALESCE(b.buyer_lead_status, '')) LIKE '%negotiat%')");
      } else if (oc === "closed" || oc === "won") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) IN ('closed', 'won', 'converted') OR LOWER(COALESCE(b.buyer_lead_stage, '')) IN ('closed', 'won'))");
      } else if (oc === "lost") {
        whereConditions.push("(LOWER(COALESCE(b.buyer_lead_status, '')) IN ('lost', 'rejected') OR LOWER(COALESCE(b.buyer_lead_stage, '')) IN ('lost', 'rejected'))");
      }
    }

    const whereClause = whereConditions.join(" AND ");

    // 1. Overall KPI Stats
    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN (b.is_active = 1 OR b.is_active IS NULL) AND LOWER(COALESCE(b.buyer_lead_status, '')) NOT IN ('closed', 'won', 'converted', 'lost', 'rejected') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) LIKE '%qualif%' OR LOWER(COALESCE(b.buyer_lead_stage, '')) LIKE '%qualif%' OR LOWER(COALESCE(b.buyer_lead_priority, '')) = 'high' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN b.id IN (SELECT DISTINCT buyer_id FROM property_visits WHERE buyer_id IS NOT NULL) THEN 1 ELSE 0 END) AS visit_count,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_stage, '')) LIKE '%negotiat%' OR LOWER(COALESCE(b.buyer_lead_status, '')) LIKE '%negotiat%' THEN 1 ELSE 0 END) AS negotiation_count,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) IN ('closed', 'won', 'converted') OR LOWER(COALESCE(b.buyer_lead_stage, '')) IN ('closed', 'won', 'closed/won') THEN 1 ELSE 0 END) AS converted_count,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) IN ('lost', 'rejected') OR LOWER(COALESCE(b.buyer_lead_stage, '')) IN ('lost', 'rejected') THEN 1 ELSE 0 END) AS lost_count
      FROM buyers b
      WHERE ${whereClause}
    `;

    // 2. Lifecycle Funnel by Stages
    const funnelSql = `
      SELECT 
        COALESCE(NULLIF(TRIM(buyer_lead_stage), ''), 'New') AS stage,
        COUNT(*) AS count
      FROM buyers b
      WHERE ${whereClause}
      GROUP BY stage
      ORDER BY count DESC
    `;

    // 3. Buyer Requirements Demand Raw Aggregation
    const reqSql = `
      SELECT b.id, b.requirements, b.financials, b.budget_min, b.budget_max, b.location, b.city
      FROM buyers b
      WHERE ${whereClause}
    `;

    // 4. Location Demand Analysis
    const locSql = `
      SELECT 
        COALESCE(NULLIF(TRIM(b.location), ''), NULLIF(TRIM(b.city), ''), 'Unspecified') AS location_name,
        COUNT(*) AS buyer_count,
        ROUND(AVG(NULLIF(b.budget_max, 0)), 0) AS avg_budget_max,
        ROUND(AVG(NULLIF(b.budget_min, 0)), 0) AS avg_budget_min,
        MIN(NULLIF(b.budget_min, 0)) AS min_budget,
        MAX(NULLIF(b.budget_max, 0)) AS max_budget,
        SUM(CASE WHEN (SELECT COUNT(*) FROM property_visits pv WHERE pv.buyer_id = b.id) > 0 THEN 1 ELSE 0 END) AS site_visits,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS closed_deals
      FROM buyers b
      WHERE ${whereClause}
      GROUP BY location_name
      ORDER BY buyer_count DESC
      LIMIT 10
    `;

    // 5. Budget Distribution Stats
    const budgetSql = `
      SELECT 
        SUM(CASE WHEN b.budget_max > 0 AND b.budget_max < 5000000 THEN 1 ELSE 0 END) AS range_below_50l,
        SUM(CASE WHEN b.budget_max >= 5000000 AND b.budget_max < 10000000 THEN 1 ELSE 0 END) AS range_50l_1cr,
        SUM(CASE WHEN b.budget_max >= 10000000 AND b.budget_max < 20000000 THEN 1 ELSE 0 END) AS range_1cr_2cr,
        SUM(CASE WHEN b.budget_max >= 20000000 AND b.budget_max < 50000000 THEN 1 ELSE 0 END) AS range_2cr_5cr,
        SUM(CASE WHEN b.budget_max >= 50000000 THEN 1 ELSE 0 END) AS range_above_5cr,
        AVG(NULLIF(b.budget_max, 0)) AS avg_budget,
        MIN(NULLIF(b.budget_min, 0)) AS min_budget,
        MAX(NULLIF(b.budget_max, 0)) AS max_budget
      FROM buyers b
      WHERE ${whereClause}
    `;

    // 6. Property Matching & Saved Properties Stats
    const matchingSql = `
      SELECT 
        COUNT(DISTINCT b.id) AS total_buyers,
        COUNT(DISTINCT bsp.buyer_id) AS buyers_with_saved,
        COUNT(bsp.id) AS total_saved_properties,
        AVG(IFNULL(bsp_cnt.cnt, 0)) AS avg_saved_per_buyer
      FROM buyers b
      LEFT JOIN buyer_saved_properties bsp ON b.id = bsp.buyer_id
      LEFT JOIN (
        SELECT buyer_id, COUNT(*) AS cnt FROM buyer_saved_properties GROUP BY buyer_id
      ) bsp_cnt ON b.id = bsp_cnt.buyer_id
      WHERE ${whereClause}
    `;

    // 7. Site Visit Performance
    const visitSql = `
      SELECT 
        COUNT(pv.id) AS total_visits,
        COUNT(DISTINCT pv.buyer_id) AS unique_visit_buyers,
        SUM(CASE WHEN LOWER(COALESCE(pv.status, '')) IN ('scheduled', 'upcoming') THEN 1 ELSE 0 END) AS upcoming_visits,
        SUM(CASE WHEN LOWER(COALESCE(pv.status, '')) = 'completed' THEN 1 ELSE 0 END) AS completed_visits,
        SUM(CASE WHEN LOWER(COALESCE(pv.status, '')) IN ('cancelled', 'rejected') THEN 1 ELSE 0 END) AS cancelled_visits,
        AVG(NULLIF(pv.rating, 0)) AS avg_rating
      FROM property_visits pv
      INNER JOIN buyers b ON pv.buyer_id = b.id
      WHERE ${whereClause}
    `;

    // 8. Executive Performance Table
    const execSql = `
      SELECT 
        COALESCE(b.assigned_executive, 0) AS executive_id,
        COALESCE(CONCAT_WS(' ', u.first_name, u.last_name), 'Unassigned') AS executive_name,
        COUNT(*) AS total_buyers,
        SUM(CASE WHEN (b.is_active = 1 OR b.is_active IS NULL) AND LOWER(COALESCE(b.buyer_lead_status, '')) NOT IN ('closed', 'won', 'converted', 'lost', 'rejected') THEN 1 ELSE 0 END) AS active_buyers,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified_buyers,
        SUM(CASE WHEN (SELECT COUNT(*) FROM property_visits pv WHERE pv.buyer_id = b.id) > 0 THEN 1 ELSE 0 END) AS site_visits,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_stage, '')) LIKE '%negotiat%' THEN 1 ELSE 0 END) AS negotiation_buyers,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) IN ('closed', 'won', 'converted') THEN 1 ELSE 0 END) AS closed_buyers,
        SUM(CASE WHEN LOWER(COALESCE(b.buyer_lead_status, '')) IN ('lost', 'rejected') THEN 1 ELSE 0 END) AS lost_buyers
      FROM buyers b
      LEFT JOIN users u ON b.assigned_executive = u.id
      WHERE ${whereClause}
      GROUP BY executive_id, executive_name
      ORDER BY total_buyers DESC
    `;

    // 9. Follow-up Insights
    const followupSql = `
      SELECT 
        SUM(CASE WHEN DATE(bf.schedule_date) = CURDATE() AND (bf.completed_date IS NULL) THEN 1 ELSE 0 END) AS today_followups,
        SUM(CASE WHEN DATE(bf.schedule_date) < CURDATE() AND (bf.completed_date IS NULL) THEN 1 ELSE 0 END) AS overdue_followups,
        SUM(CASE WHEN DATE(bf.schedule_date) > CURDATE() AND (bf.completed_date IS NULL) THEN 1 ELSE 0 END) AS upcoming_followups,
        SUM(CASE WHEN bf.id IS NULL THEN 1 ELSE 0 END) AS no_followup_buyers
      FROM buyers b
      LEFT JOIN buyer_followups bf ON b.id = bf.buyer_id
      WHERE ${whereClause}
    `;

    // 10. Detailed Paginated Data Table Query
    const countSql = `SELECT COUNT(*) AS total FROM buyers b WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        b.id, b.salutation, b.name, b.phone, b.whatsapp_number, b.email,
        b.state, b.city, b.location,
        b.buyer_lead_priority, b.buyer_lead_source, b.buyer_lead_stage, b.buyer_lead_status,
        b.budget_min, b.budget_max, b.requirements, b.financials,
        b.assigned_executive, b.is_active, b.created_at, b.updated_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name,
        (SELECT COUNT(*) FROM property_visits pv WHERE pv.buyer_id = b.id) AS visit_count,
        (SELECT COUNT(*) FROM buyer_saved_properties bsp WHERE bsp.buyer_id = b.id) AS saved_count,
        (SELECT MAX(created_at) FROM buyer_followups bf WHERE bf.buyer_id = b.id) AS last_activity
      FROM buyers b
      LEFT JOIN users u ON b.assigned_executive = u.id
      WHERE ${whereClause}
      ORDER BY b.id DESC
      LIMIT ? OFFSET ?
    `;

    // Execute queries in parallel
    const [
      [[statsRes]],
      [funnelRows],
      [reqRows],
      [locationRows],
      [[budgetRes]],
      [[matchingRes]],
      [[visitRes]],
      [execRows],
      [[followupRes]],
      [[{ total }]],
      [dataRows],
    ] = await Promise.all([
      db.query(statsSql, queryParams).catch(() => [[{ total_count: 0 }]]),
      db.query(funnelSql, queryParams).catch(() => [[]]),
      db.query(reqSql, queryParams).catch(() => [[]]),
      db.query(locSql, queryParams).catch(() => [[]]),
      db.query(budgetSql, queryParams).catch(() => [[{ range_below_50l: 0 }]]),
      db.query(matchingSql, queryParams).catch(() => [[{ total_buyers: 0 }]]),
      db.query(visitSql, queryParams).catch(() => [[{ total_visits: 0 }]]),
      db.query(execSql, queryParams).catch(() => [[]]),
      db.query(followupSql, queryParams).catch(() => [[{ today_followups: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    // Process Requirements JSON Breakdown for Property Types, Unit Types, Furnishing, Facing, Floor, Amenities, Loan
    const propTypes = {};
    const unitTypes = {};
    const furnishings = {};
    const facings = {};
    const floors = {};
    const amenities = {};
    let loanRequiredCount = 0;
    let loanAmountSum = 0;
    let loanAmountCount = 0;
    let downPaymentSum = 0;
    let downPaymentCount = 0;

    (reqRows || []).forEach((row) => {
      let reqObj = {};
      let finObj = {};
      try {
        reqObj = typeof row.requirements === "string" ? JSON.parse(row.requirements) : (row.requirements || {});
      } catch (e) {}
      try {
        finObj = typeof row.financials === "string" ? JSON.parse(row.financials) : (row.financials || {});
      } catch (e) {}

      // Property type
      const pt = reqObj.propertyType || reqObj.property_type || reqObj.type;
      if (pt) propTypes[pt] = (propTypes[pt] || 0) + 1;

      // Unit types
      const uArr = Array.isArray(reqObj.unitTypes) ? reqObj.unitTypes : (reqObj.unitType ? [reqObj.unitType] : []);
      uArr.forEach((ut) => {
        if (ut) unitTypes[ut] = (unitTypes[ut] || 0) + 1;
      });

      // Furnishing
      const f = reqObj.furnishing;
      if (f) furnishings[f] = (furnishings[f] || 0) + 1;

      // Facing
      const fc = reqObj.facing;
      if (fc) facings[fc] = (facings[fc] || 0) + 1;

      // Floor
      const fl = reqObj.floor;
      if (fl) floors[fl] = (floors[fl] || 0) + 1;

      // Amenities
      const amArr = Array.isArray(reqObj.amenities) ? reqObj.amenities : [];
      amArr.forEach((am) => {
        if (am) amenities[am] = (amenities[am] || 0) + 1;
      });

      // Loan & Financials
      if (finObj.loanRequired === true || finObj.loanRequired === "yes" || finObj.loanRequired === "true") {
        loanRequiredCount++;
        if (finObj.loanAmount) {
          const lAmt = Number(finObj.loanAmount);
          if (!isNaN(lAmt) && lAmt > 0) {
            loanAmountSum += lAmt;
            loanAmountCount++;
          }
        }
        if (finObj.downPayment) {
          const dAmt = Number(finObj.downPayment);
          if (!isNaN(dAmt) && dAmt > 0) {
            downPaymentSum += dAmt;
            downPaymentCount++;
          }
        }
      }
    });

    const totalReqBuyers = reqRows.length || 1;

    // Formatting demands
    const formatDemandMap = (mapObj) =>
      Object.entries(mapObj)
        .map(([name, count]) => ({ name, count, percentage: Math.round((count / totalReqBuyers) * 100) }))
        .sort((a, b) => b.count - a.count);

    const demands = {
      propertyTypes: formatDemandMap(propTypes),
      unitTypes: formatDemandMap(unitTypes),
      furnishings: formatDemandMap(furnishings),
      facings: formatDemandMap(facings),
      floors: formatDemandMap(floors),
      amenities: formatDemandMap(amenities),
    };

    // Calculate Conversion Rate
    const totalCount = Number(statsRes?.total_count || 0);
    const convertedCount = Number(statsRes?.converted_count || 0);
    const conversionRate = totalCount > 0 ? Number(((convertedCount / totalCount) * 100).toFixed(1)) : 0;

    const stats = {
      total_count: totalCount,
      active_count: Number(statsRes?.active_count || 0),
      new_count: Number(statsRes?.new_count || 0),
      qualified_count: Number(statsRes?.qualified_count || 0),
      visit_count: Number(statsRes?.visit_count || 0),
      negotiation_count: Number(statsRes?.negotiation_count || 0),
      converted_count: convertedCount,
      lost_count: Number(statsRes?.lost_count || 0),
      conversion_rate: conversionRate,
    };

    // Process Funnel Percentages
    const funnel = (funnelRows || []).map((row) => ({
      stage: row.stage,
      count: Number(row.count || 0),
      percentage: totalCount > 0 ? Math.round((Number(row.count || 0) / totalCount) * 100) : 0,
    }));

    // Process Budget Analytics
    const budgets = {
      distribution: [
        { label: "Below ₹50L", min: 0, max: 5000000, count: Number(budgetRes?.range_below_50l || 0) },
        { label: "₹50L - ₹1Cr", min: 5000000, max: 10000000, count: Number(budgetRes?.range_50l_1cr || 0) },
        { label: "₹1Cr - ₹2Cr", min: 10000000, max: 20000000, count: Number(budgetRes?.range_1cr_2cr || 0) },
        { label: "₹2Cr - ₹5Cr", min: 20000000, max: 50000000, count: Number(budgetRes?.range_2cr_5cr || 0) },
        { label: "Above ₹5Cr", min: 50000000, max: 999999999, count: Number(budgetRes?.range_above_5cr || 0) },
      ],
      avgBudget: Number(budgetRes?.avg_budget || 0),
      minBudget: Number(budgetRes?.min_budget || 0),
      maxBudget: Number(budgetRes?.max_budget || 0),
    };

    // Matching Stats
    const matching = {
      totalBuyers: Number(matchingRes?.total_buyers || totalCount),
      buyersWithMatches: Number(matchingRes?.buyers_with_saved || 0),
      buyersWithoutMatches: Math.max(0, Number(matchingRes?.total_buyers || totalCount) - Number(matchingRes?.buyers_with_saved || 0)),
      avgMatchesPerBuyer: Number(Number(matchingRes?.avg_saved_per_buyer || 0).toFixed(1)),
      totalSavedProperties: Number(matchingRes?.total_saved_properties || 0),
    };

    // Site Visit Stats
    const visits = {
      totalVisits: Number(visitRes?.total_visits || 0),
      uniqueBuyers: Number(visitRes?.unique_visit_buyers || 0),
      avgVisitsPerBuyer: totalCount > 0 ? Number((Number(visitRes?.total_visits || 0) / totalCount).toFixed(1)) : 0,
      upcomingVisits: Number(visitRes?.upcoming_visits || 0),
      completedVisits: Number(visitRes?.completed_visits || 0),
      cancelledVisits: Number(visitRes?.cancelled_visits || 0),
      avgRating: Number(Number(visitRes?.avg_rating || 0).toFixed(1)),
    };

    // Executives Table
    const executives = (execRows || []).map((ex) => {
      const tot = Number(ex.total_buyers || 0);
      const cls = Number(ex.closed_buyers || 0);
      return {
        executive_id: ex.executive_id,
        name: ex.executive_name,
        total_buyers: tot,
        active_buyers: Number(ex.active_buyers || 0),
        qualified_buyers: Number(ex.qualified_buyers || 0),
        site_visits: Number(ex.site_visits || 0),
        negotiation_buyers: Number(ex.negotiation_buyers || 0),
        closed_buyers: cls,
        lost_buyers: Number(ex.lost_buyers || 0),
        conversion_rate: tot > 0 ? Number(((cls / tot) * 100).toFixed(1)) : 0,
      };
    });

    // Follow-ups Insights
    const followups = {
      today: Number(followupRes?.today_followups || 0),
      overdue: Number(followupRes?.overdue_followups || 0),
      upcoming: Number(followupRes?.upcoming_followups || 0),
      noFollowup: Number(followupRes?.no_followup_buyers || 0),
    };

    // Financial Readiness Summary
    const financials = {
      loanRequiredCount,
      selfFundedCount: Math.max(0, totalCount - loanRequiredCount),
      avgLoanAmount: loanAmountCount > 0 ? Math.round(loanAmountSum / loanAmountCount) : 0,
      avgDownPayment: downPaymentCount > 0 ? Math.round(downPaymentSum / downPaymentCount) : 0,
    };

    // Process Rows for JSON parsing and delivery
    const data = (dataRows || []).map((r) => {
      let requirements = {};
      let financials = {};
      try {
        requirements = typeof r.requirements === "string" ? JSON.parse(r.requirements) : (r.requirements || {});
      } catch (e) {}
      try {
        financials = typeof r.financials === "string" ? JSON.parse(r.financials) : (r.financials || {});
      } catch (e) {}

      // Hide full credit score / sensitive fields unless admin / authorized
      const isExecutive = String(req.userRole || "").toLowerCase().includes("executive");
      if (isExecutive && financials.creditScore) {
        financials.creditScore = "***";
      }

      return {
        ...r,
        requirements,
        financials,
        budget: { min: r.budget_min, max: r.budget_max },
      };
    });

    res.status(200).json({
      success: true,
      stats,
      funnel,
      demands,
      locations: locationRows,
      budgets,
      matching,
      visits,
      executives,
      followups,
      financials,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: Number(total || 0),
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data,
    });
  } catch (err) {
    console.error("Error in getBuyerReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch buyer report", error: err.message });
  }
};

/* ==========================================================================
   8. SELLER REPORT
   ========================================================================== */

exports.getSellerReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "s", "assigned_to", "created_by");
    const {
      page = 1,
      limit = 25,
      search = "",
      status = "",
      stage = "",
      priority = "",
      source = "",
      leadSource = "",
      lead_type = "",
      leadType = "",
      assigned_executive = "",
      assignedTo = "",
      agentId = "",
      location = "",
      property_type = "",
      propertyType = "",
      minDealValue = "",
      maxDealValue = "",
      minLeadScore = "",
      maxLeadScore = "",
      followupStatus = "",
      documentStatus = "",
      startDate = "",
      endDate = "",
      ignoreDate = "true",
      aging_range = "",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    const effSource = (source || leadSource || "").trim();
    const effLeadType = (lead_type || leadType || "").trim();
    const effAgent = (assigned_executive || assignedTo || agentId || "").trim();
    const effPropType = (property_type || propertyType || "").trim();
    const shouldIgnoreDate = String(ignoreDate) === "true" || ignoreDate === true;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(s.name LIKE ? OR s.email LIKE ? OR s.phone LIKE ? OR s.location LIKE ? OR s.city LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(COALESCE(s.status, '')) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (stage && stage !== "all") {
      whereConditions.push("LOWER(COALESCE(s.stage, '')) = ?");
      queryParams.push(stage.toLowerCase().trim());
    }
    if (priority && priority !== "all") {
      whereConditions.push("LOWER(COALESCE(s.priority, '')) = ?");
      queryParams.push(priority.toLowerCase().trim());
    }
    if (effSource && effSource !== "all") {
      whereConditions.push("LOWER(COALESCE(s.source, '')) = ?");
      queryParams.push(effSource.toLowerCase().trim());
    }
    if (effLeadType && effLeadType !== "all") {
      whereConditions.push("LOWER(COALESCE(s.leadType, '')) = ?");
      queryParams.push(effLeadType.toLowerCase().trim());
    }
    if (effAgent && effAgent !== "all") {
      whereConditions.push("s.assigned_to = ?");
      queryParams.push(parseInt(effAgent, 10));
    }
    if (location) {
      whereConditions.push("(s.location LIKE ? OR s.city LIKE ?)");
      const loc = `%${location.trim()}%`;
      queryParams.push(loc, loc);
    }
    if (effPropType && effPropType !== "all") {
      whereConditions.push(
        "EXISTS (SELECT 1 FROM my_properties mp WHERE (mp.seller_id = s.id OR LOWER(TRIM(mp.seller_name)) = LOWER(TRIM(s.name))) AND (LOWER(COALESCE(mp.unit_type, '')) LIKE ? OR LOWER(COALESCE(mp.property_type, '')) LIKE ?))"
      );
      const pVal = `%${effPropType.toLowerCase()}%`;
      queryParams.push(pVal, pVal);
    }
    if (minDealValue !== "" && !isNaN(Number(minDealValue))) {
      whereConditions.push("s.deal_value >= ?");
      queryParams.push(Number(minDealValue));
    }
    if (maxDealValue !== "" && !isNaN(Number(maxDealValue))) {
      whereConditions.push("s.deal_value <= ?");
      queryParams.push(Number(maxDealValue));
    }
    if (minLeadScore !== "" && !isNaN(Number(minLeadScore))) {
      whereConditions.push("s.lead_score >= ?");
      queryParams.push(Number(minLeadScore));
    }
    if (maxLeadScore !== "" && !isNaN(Number(maxLeadScore))) {
      whereConditions.push("s.lead_score <= ?");
      queryParams.push(Number(maxLeadScore));
    }
    if (followupStatus && followupStatus !== "all") {
      whereConditions.push(
        "EXISTS (SELECT 1 FROM seller_followups sf WHERE sf.seller_id = s.id AND LOWER(COALESCE(sf.status, '')) = ?)"
      );
      queryParams.push(followupStatus.toLowerCase().trim());
    }
    if (documentStatus && documentStatus !== "all") {
      whereConditions.push(
        "EXISTS (SELECT 1 FROM seller_documents sd WHERE sd.seller_id = s.id AND LOWER(COALESCE(sd.status, '')) = ?)"
      );
      queryParams.push(documentStatus.toLowerCase().trim());
    }
    if (startDate && !shouldIgnoreDate) {
      whereConditions.push("DATE(s.created_at) >= ?");
      queryParams.push(startDate);
    }
    if (endDate && !shouldIgnoreDate) {
      whereConditions.push("DATE(s.created_at) <= ?");
      queryParams.push(endDate);
    }
    if (aging_range && aging_range !== "all") {
      if (aging_range === "0_7") whereConditions.push("DATEDIFF(NOW(), s.created_at) BETWEEN 0 AND 7");
      else if (aging_range === "8_15") whereConditions.push("DATEDIFF(NOW(), s.created_at) BETWEEN 8 AND 15");
      else if (aging_range === "16_30") whereConditions.push("DATEDIFF(NOW(), s.created_at) BETWEEN 16 AND 30");
      else if (aging_range === "31_60") whereConditions.push("DATEDIFF(NOW(), s.created_at) BETWEEN 31 AND 60");
      else if (aging_range === "60_plus") whereConditions.push("DATEDIFF(NOW(), s.created_at) > 60");
    }

    const whereClause = whereConditions.join(" AND ");

    const VAL_EXPR = "COALESCE(NULLIF(CAST(REPLACE(REPLACE(s.deal_value, '₹', ''), ',', '') AS DECIMAL(15,2)), 0), NULLIF(CAST(REPLACE(REPLACE(s.expected_price, '₹', ''), ',', '') AS DECIMAL(15,2)), 0), 0)";
    const AGE_EXPR = "COALESCE(NULLIF(CAST(s.days_listed AS SIGNED), 0), DATEDIFF(NOW(), COALESCE(s.created_at, NOW())), 0)";

    // 1. Top Header Stats SQL (Filter-sensitive so top header updates dynamically)
    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('active', 'published', 'new', 'fresh', 'new seller status', '') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('sold', 'closed', 'converted') THEN 1 ELSE 0 END) AS sold_count
      FROM sellers s
      WHERE ${whereClause}
    `;

    // 2. Summary KPIs SQL
    const summarySql = `
      SELECT
        COUNT(*) AS total_sellers,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('active', 'published', 'new', 'fresh', 'new seller status', '') THEN 1 ELSE 0 END) AS active_sellers,
        SUM(CASE WHEN LOWER(COALESCE(s.priority, '')) IN ('high', 'hot') OR s.lead_score >= 75 THEN 1 ELSE 0 END) AS hot_sellers,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('sold', 'closed', 'converted') THEN 1 ELSE 0 END) AS closed_sold,
        COALESCE(SUM(${VAL_EXPR}), 0) AS total_pipeline_value,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(s.status, '')) NOT IN ('sold', 'closed') THEN ${VAL_EXPR} ELSE 0 END), 0) AS expected_closing_value,
        COALESCE(AVG(NULLIF(${VAL_EXPR}, 0)), 0) AS avg_deal_value,
        COALESCE(AVG(s.lead_score), 0) AS avg_lead_score,
        COALESCE(MAX(${VAL_EXPR}), 0) AS highest_deal_value,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('sold', 'closed') THEN ${VAL_EXPR} ELSE 0 END), 0) AS closed_deal_value
      FROM sellers s
      WHERE ${whereClause}
    `;

    // 3. Pipeline Stages Breakdown SQL
    const pipelineSql = `
      SELECT 
        COALESCE(NULLIF(TRIM(s.stage), ''), 'New') AS raw_stage,
        COUNT(*) AS seller_count,
        COALESCE(SUM(${VAL_EXPR}), 0) AS total_value
      FROM sellers s
      WHERE ${whereClause}
      GROUP BY COALESCE(NULLIF(TRIM(s.stage), ''), 'New')
      ORDER BY seller_count DESC
    `;

    // 4. Seller Aging Breakdown SQL
    const agingSql = `
      SELECT
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 0 AND 7 THEN 1 ELSE 0 END) AS age_0_7_count,
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 0 AND 7 THEN ${VAL_EXPR} ELSE 0 END) AS age_0_7_val,
        
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 8 AND 15 THEN 1 ELSE 0 END) AS age_8_15_count,
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 8 AND 15 THEN ${VAL_EXPR} ELSE 0 END) AS age_8_15_val,
        
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 16 AND 30 THEN 1 ELSE 0 END) AS age_16_30_count,
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 16 AND 30 THEN ${VAL_EXPR} ELSE 0 END) AS age_16_30_val,
        
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS age_31_60_count,
        SUM(CASE WHEN ${AGE_EXPR} BETWEEN 31 AND 60 THEN ${VAL_EXPR} ELSE 0 END) AS age_31_60_val,
        
        SUM(CASE WHEN ${AGE_EXPR} > 60 THEN 1 ELSE 0 END) AS age_60_plus_count,
        SUM(CASE WHEN ${AGE_EXPR} > 60 THEN ${VAL_EXPR} ELSE 0 END) AS age_60_plus_val
      FROM sellers s
      WHERE ${whereClause}
    `;

    // 5. Follow-ups Performance SQL
    const followupsSummarySql = `
      SELECT
        COUNT(*) AS total_followups,
        SUM(CASE WHEN LOWER(COALESCE(sf.status, '')) IN ('completed', 'done') THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN LOWER(COALESCE(sf.status, '')) IN ('pending', 'scheduled') THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN LOWER(COALESCE(sf.status, '')) = 'missed' THEN 1 ELSE 0 END) AS missed_count,
        SUM(CASE WHEN LOWER(COALESCE(sf.status, '')) = 'pending' AND COALESCE(sf.followup_date, sf.schedule_date) < CURDATE() THEN 1 ELSE 0 END) AS overdue_count
      FROM seller_followups sf
      JOIN sellers s ON sf.seller_id = s.id
      WHERE ${whereClause}
    `;

    const followupsTypesSql = `
      SELECT
        COALESCE(NULLIF(TRIM(sf.followup_type), ''), 'Call') AS type_name,
        COUNT(*) AS count
      FROM seller_followups sf
      JOIN sellers s ON sf.seller_id = s.id
      WHERE ${whereClause}
      GROUP BY COALESCE(NULLIF(TRIM(sf.followup_type), ''), 'Call')
    `;

    const sellersNoFollowupSql = `
      SELECT COUNT(*) AS no_followup_count
      FROM sellers s
      WHERE ${whereClause}
        AND s.id NOT IN (
          SELECT DISTINCT seller_id 
          FROM seller_followups 
          WHERE LOWER(COALESCE(status, '')) IN ('pending', 'scheduled')
            AND COALESCE(followup_date, schedule_date) >= CURDATE()
        )
    `;

    // 6. Property Analytics SQL (Properties linked to filtered sellers)
    const propertyAnalyticsSql = `
      SELECT
        COUNT(p.id) AS total_linked_properties,
        COUNT(DISTINCT p.seller_id) AS sellers_with_properties
      FROM my_properties p
      JOIN sellers s ON (p.seller_id = s.id OR LOWER(TRIM(p.seller_name)) = LOWER(TRIM(s.name)))
      WHERE ${whereClause}
    `;

    const propertyTypesSql = `
      SELECT
        COALESCE(NULLIF(TRIM(p.unit_type), ''), NULLIF(TRIM(p.property_type), ''), 'Residential') AS prop_type,
        COUNT(*) AS count
      FROM my_properties p
      JOIN sellers s ON (p.seller_id = s.id OR LOWER(TRIM(p.seller_name)) = LOWER(TRIM(s.name)))
      WHERE ${whereClause}
      GROUP BY COALESCE(NULLIF(TRIM(p.unit_type), ''), NULLIF(TRIM(p.property_type), ''), 'Residential')
      ORDER BY count DESC
      LIMIT 10
    `;

    const propertyLocationsSql = `
      SELECT
        COALESCE(NULLIF(TRIM(p.location), ''), NULLIF(TRIM(p.city), ''), 'Unspecified') AS prop_location,
        COUNT(*) AS count
      FROM my_properties p
      JOIN sellers s ON (p.seller_id = s.id OR LOWER(TRIM(p.seller_name)) = LOWER(TRIM(s.name)))
      WHERE ${whereClause}
      GROUP BY COALESCE(NULLIF(TRIM(p.location), ''), NULLIF(TRIM(p.city), ''), 'Unspecified')
      ORDER BY count DESC
      LIMIT 10
    `;

    // 7. Source Performance SQL
    const sourceAnalyticsSql = `
      SELECT
        COALESCE(NULLIF(TRIM(s.source), ''), 'Direct / Organic') AS source_name,
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('active', 'published', 'new', 'fresh', '') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(s.stage, '')) IN ('listed', 'property_listed') THEN 1 ELSE 0 END) AS listed_count,
        SUM(CASE WHEN LOWER(COALESCE(s.stage, '')) IN ('negotiation', 'negotiating') THEN 1 ELSE 0 END) AS negotiation_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('sold', 'closed', 'converted') THEN 1 ELSE 0 END) AS closed_count,
        COALESCE(SUM(s.deal_value), 0) AS total_pipeline_value
      FROM sellers s
      WHERE ${whereClause}
      GROUP BY COALESCE(NULLIF(TRIM(s.source), ''), 'Direct / Organic')
      ORDER BY total_count DESC
    `;

    // 8. Document Analytics SQL
    const documentAnalyticsSql = `
      SELECT
        COUNT(sd.id) AS total_documents,
        SUM(CASE WHEN LOWER(COALESCE(sd.status, '')) IN ('verified', 'approved') THEN 1 ELSE 0 END) AS verified_count,
        SUM(CASE WHEN LOWER(COALESCE(sd.status, '')) IN ('pending', 'under_review', '') THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN LOWER(COALESCE(sd.status, '')) IN ('rejected', 'invalid') THEN 1 ELSE 0 END) AS rejected_count,
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(sd.status, '')) IN ('pending', 'under_review', '') THEN sd.seller_id END) AS sellers_pending_docs,
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(sd.status, '')) IN ('rejected', 'invalid') THEN sd.seller_id END) AS sellers_rejected_docs
      FROM seller_documents sd
      JOIN sellers s ON sd.seller_id = s.id
      WHERE ${whereClause}
    `;

    // 9. Co-seller Analytics SQL
    const cosellerAnalyticsSql = `
      SELECT
        COUNT(sc.id) AS total_cosellers,
        COUNT(DISTINCT sc.seller_id) AS sellers_with_cosellers
      FROM seller_cosellers sc
      JOIN sellers s ON sc.seller_id = s.id
      WHERE ${whereClause}
    `;

    const cosellerRelationsSql = `
      SELECT
        COALESCE(NULLIF(TRIM(sc.relation), ''), 'Other') AS relation_name,
        COUNT(*) AS count
      FROM seller_cosellers sc
      JOIN sellers s ON sc.seller_id = s.id
      WHERE ${whereClause}
      GROUP BY COALESCE(NULLIF(TRIM(sc.relation), ''), 'Other')
      ORDER BY count DESC
    `;

    // 10. Agent Performance SQL
    const agentPerformanceSql = `
      SELECT
        u.id AS agent_id,
        CONCAT_WS(' ', u.salutation, u.first_name, u.last_name) AS agent_name,
        COUNT(s.id) AS total_sellers,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('active', 'published', 'new', 'fresh', '') THEN 1 ELSE 0 END) AS active_sellers,
        SUM(CASE WHEN LOWER(COALESCE(s.stage, '')) IN ('negotiation', 'negotiating') THEN 1 ELSE 0 END) AS negotiation_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('sold', 'closed', 'converted') THEN 1 ELSE 0 END) AS closed_count,
        COALESCE(SUM(s.deal_value), 0) AS total_pipeline_value,
        COALESCE(AVG(s.response_rate), 0) AS response_rate,
        COALESCE(MIN(s.avg_response_time), '15 mins') AS avg_response_time
      FROM users u
      JOIN sellers s ON s.assigned_to = u.id
      WHERE ${whereClause}
      GROUP BY u.id, u.salutation, u.first_name, u.last_name
      ORDER BY total_sellers DESC
    `;

    // 11. Table Data & Count SQL
    const countSql = `SELECT COUNT(*) AS total FROM sellers s WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        s.id, s.salutation, s.name, s.phone, s.email, s.city, s.location, s.source,
        s.priority, s.stage, s.status, s.lead_score, s.deal_value, s.last_activity, s.created_at,
        COALESCE(s.status, 'active') AS seller_lead_status, 
        COALESCE(s.stage, 'New') AS seller_lead_stage,
        COALESCE(MAX(p.final_price), MAX(p.budget), s.deal_value, 0) AS expected_price,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name,
        DATEDIFF(NOW(), s.created_at) AS days_listed
      FROM sellers s
      LEFT JOIN my_properties p ON (p.seller_id = s.id OR LOWER(TRIM(p.seller_name)) = LOWER(TRIM(s.name)))
      LEFT JOIN users u ON s.assigned_to = u.id
      WHERE ${whereClause}
      GROUP BY s.id, s.salutation, s.name, s.phone, s.email, s.city, s.location, s.source, s.priority, s.stage, s.status, s.lead_score, s.deal_value, s.last_activity, s.created_at, u.first_name, u.last_name
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `;

    // Execute queries safely in parallel
    const [
      [[statsData]],
      [[summaryData]],
      [pipelineRows],
      [[agingData]],
      [[followupsSummary]],
      [followupsTypes],
      [[sellersNoFollowup]],
      [[propertyAnalytics]],
      [propertyTypes],
      [propertyLocations],
      [sourceAnalytics],
      [[documentAnalytics]],
      [[cosellerAnalytics]],
      [cosellerRelations],
      [agentPerformance],
      [[{ total }]],
      [rows],
    ] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, active_count: 0, sold_count: 0 }]]),
      db.query(summarySql, queryParams).catch(() => [[{}]]),
      db.query(pipelineSql, queryParams).catch(() => [[]]),
      db.query(agingSql, queryParams).catch(() => [[{}]]),
      db.query(followupsSummarySql, queryParams).catch(() => [[{}]]),
      db.query(followupsTypesSql, queryParams).catch(() => [[]]),
      db.query(sellersNoFollowupSql, queryParams).catch(() => [[{ no_followup_count: 0 }]]),
      db.query(propertyAnalyticsSql, queryParams).catch(() => [[{ total_linked_properties: 0, sellers_with_properties: 0 }]]),
      db.query(propertyTypesSql, queryParams).catch(() => [[]]),
      db.query(propertyLocationsSql, queryParams).catch(() => [[]]),
      db.query(sourceAnalyticsSql, queryParams).catch(() => [[]]),
      db.query(documentAnalyticsSql, queryParams).catch(() => [[{}]]),
      db.query(cosellerAnalyticsSql, queryParams).catch(() => [[{ total_cosellers: 0, sellers_with_cosellers: 0 }]]),
      db.query(cosellerRelationsSql, queryParams).catch(() => [[]]),
      db.query(agentPerformanceSql, queryParams).catch(() => [[]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    // Format Pipeline
    const totalSellersCount = Number(summaryData?.total_sellers || total || 0);
    const normalizeStageName = (stg) => {
      if (!stg) return "New";
      const s = String(stg).trim().toLowerCase();
      if (s === "initial_contact") return "Initial Contact";
      if (s === "mandate_signed") return "Mandate Signed";
      if (s === "new" || s === "fresh" || s === "new seller status") return "New";
      if (s === "active" || s === "listed" || s === "listing_active") return "Listed";
      if (s === "buyer_interest" || s === "buyer interest") return "Buyer Interest";
      if (s === "negotiation" || s === "negotiating") return "Negotiation";
      if (s === "agreement") return "Agreement";
      if (s === "closed" || s === "sold" || s === "converted") return "Closed";
      return String(stg).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const formattedPipeline = (pipelineRows || []).map((row) => ({
      stage: normalizeStageName(row.raw_stage || row.stage_name),
      count: Number(row.seller_count || 0),
      percentage: totalSellersCount > 0 ? Math.round((Number(row.seller_count || 0) / totalSellersCount) * 100) : 0,
      deal_value: Number(row.total_value || 0),
    }));

    // Format Aging
    const formattedAging = [
      { range: "0–7 days", key: "0_7", count: Number(agingData?.age_0_7_count || 0), deal_value: Number(agingData?.age_0_7_val || 0) },
      { range: "8–15 days", key: "8_15", count: Number(agingData?.age_8_15_count || 0), deal_value: Number(agingData?.age_8_15_val || 0) },
      { range: "16–30 days", key: "16_30", count: Number(agingData?.age_16_30_count || 0), deal_value: Number(agingData?.age_16_30_val || 0) },
      { range: "31–60 days", key: "31_60", count: Number(agingData?.age_31_60_count || 0), deal_value: Number(agingData?.age_31_60_val || 0) },
      { range: "60+ days", key: "60_plus", count: Number(agingData?.age_60_plus_count || 0), deal_value: Number(agingData?.age_60_plus_val || 0) },
    ];

    // Format Follow-up analytics
    const totalFollowupsCount = Number(followupsSummary?.total_followups || 0);
    const completedFollowupsCount = Number(followupsSummary?.completed_count || 0);
    const formattedFollowups = {
      completed: completedFollowupsCount,
      pending: Number(followupsSummary?.pending_count || 0),
      missed: Number(followupsSummary?.missed_count || 0),
      overdue: Number(followupsSummary?.overdue_count || 0),
      completion_rate: totalFollowupsCount > 0 ? Math.round((completedFollowupsCount / totalFollowupsCount) * 100) : 100,
      sellers_with_no_upcoming: Number(sellersNoFollowup?.no_followup_count || 0),
      types: (followupsTypes || []).map((t) => ({ type: t.type_name, count: Number(t.count || 0) })),
    };

    // Format Property Analytics
    const formattedProperties = {
      linked_count: Number(propertyAnalytics?.total_linked_properties || 0),
      sellers_with_properties: Number(propertyAnalytics?.sellers_with_properties || 0),
      by_type: (propertyTypes || []).map((pt) => ({ type: pt.prop_type, count: Number(pt.count || 0) })),
      by_location: (propertyLocations || []).map((pl) => ({ location: pl.prop_location, count: Number(pl.count || 0) })),
    };

    // Format Source Performance
    const formattedSources = (sourceAnalytics || []).map((s) => ({
      source: s.source_name,
      count: Number(s.total_count || 0),
      active: Number(s.active_count || 0),
      listed: Number(s.listed_count || 0),
      negotiation: Number(s.negotiation_count || 0),
      closed: Number(s.closed_count || 0),
      pipeline_value: Number(s.total_pipeline_value || 0),
    }));

    // Format Document Analytics
    const totalDocs = Number(documentAnalytics?.total_documents || 0);
    const verifiedDocs = Number(documentAnalytics?.verified_count || 0);
    const formattedDocuments = {
      total_documents: totalDocs,
      verified: verifiedDocs,
      pending: Number(documentAnalytics?.pending_count || 0),
      rejected: Number(documentAnalytics?.rejected_count || 0),
      sellers_pending: Number(documentAnalytics?.sellers_pending_docs || 0),
      sellers_rejected: Number(documentAnalytics?.sellers_rejected_docs || 0),
      verification_percentage: totalDocs > 0 ? Math.round((verifiedDocs / totalDocs) * 100) : 100,
    };

    // Format Co-seller Analytics
    const sellersWithCosellers = Number(cosellerAnalytics?.sellers_with_cosellers || 0);
    const formattedCosellers = {
      total_cosellers: Number(cosellerAnalytics?.total_cosellers || 0),
      joint_owner: sellersWithCosellers,
      single_owner: Math.max(0, totalSellersCount - sellersWithCosellers),
      relations: (cosellerRelations || []).map((cr) => ({ relation: cr.relation_name, count: Number(cr.count || 0) })),
    };

    // Format Executives Performance
    const formattedExecutives = (agentPerformance || []).map((ag) => ({
      agent_id: ag.agent_id,
      agent_name: ag.agent_name || "Unassigned",
      total_sellers: Number(ag.total_sellers || 0),
      active_sellers: Number(ag.active_sellers || 0),
      negotiation_count: Number(ag.negotiation_count || 0),
      closed_count: Number(ag.closed_count || 0),
      pipeline_value: Number(ag.total_pipeline_value || 0),
      response_rate: Math.round(Number(ag.response_rate || 90)),
      avg_response_time: ag.avg_response_time || "15m",
    }));

    // Format Financial Analytics
    const formattedFinancials = {
      total_pipeline_value: Number(summaryData?.total_pipeline_value || 0),
      expected_closing_value: Number(summaryData?.expected_closing_value || 0),
      closed_deal_value: Number(summaryData?.closed_deal_value || 0),
      avg_deal_value: Math.round(Number(summaryData?.avg_deal_value || 0)),
      highest_deal_value: Number(summaryData?.highest_deal_value || 0),
      expected_commission: Math.round(Number(summaryData?.total_pipeline_value || 0) * 0.02), // Standard 2% estimated commission
    };

    const formattedSummary = {
      total_sellers: totalSellersCount,
      active_sellers: Number(summaryData?.active_sellers || 0),
      hot_sellers: Number(summaryData?.hot_sellers || 0),
      closed_sold: Number(summaryData?.closed_sold || 0),
      properties_linked: Number(propertyAnalytics?.total_linked_properties || 0),
      pipeline_value: Number(summaryData?.total_pipeline_value || 0),
      expected_closing_value: Number(summaryData?.expected_closing_value || 0),
      followups_due: Number(followupsSummary?.pending_count || 0),
      overdue_followups: Number(followupsSummary?.overdue_count || 0),
      pending_documents: Number(documentAnalytics?.pending_count || 0),
      avg_deal_value: Math.round(Number(summaryData?.avg_deal_value || 0)),
      avg_lead_score: Math.round(Number(summaryData?.avg_lead_score || 0)),
    };

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, active_count: 0, sold_count: 0 },
      summary: formattedSummary,
      pipeline: formattedPipeline,
      aging: formattedAging,
      followups: formattedFollowups,
      properties: formattedProperties,
      sources: formattedSources,
      documents: formattedDocuments,
      cosellers: formattedCosellers,
      executives: formattedExecutives,
      financials: formattedFinancials,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: Number(total || 0),
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data: rows || [],
    });
  } catch (err) {
    console.error("Error in getSellerReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch seller report", error: err.message });
  }
};

/* ==========================================================================
   8B. TENANT REPORT
   ========================================================================== */

exports.getTenantReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "t", "assigned_to", "assigned_to");
    const { page = 1, limit = 25, search = "", status = "", tenant_type = "", preferred_bhk = "", location = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(t.name LIKE ? OR t.email LIKE ? OR t.phone LIKE ? OR t.preferred_location LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(COALESCE(t.status, '')) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (tenant_type && tenant_type !== "all") {
      whereConditions.push("LOWER(COALESCE(t.tenant_type, '')) = ?");
      queryParams.push(tenant_type.toLowerCase().trim());
    }
    if (preferred_bhk && preferred_bhk !== "all") {
      whereConditions.push("LOWER(COALESCE(t.preferred_bhk, '')) = ?");
      queryParams.push(preferred_bhk.toLowerCase().trim());
    }
    if (location) {
      whereConditions.push("t.preferred_location LIKE ?");
      queryParams.push(`%${location.trim()}%`);
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('active', 'occupied', 'new') OR status IS NULL THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('vacated', 'closed', 'inactive') THEN 1 ELSE 0 END) AS vacated_count
      FROM tenants t
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM tenants t WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        t.id, t.tenant_id, t.name, t.email, t.phone, t.whatsapp, t.preferred_location,
        t.budget_min, t.budget_max, t.preferred_bhk, t.tenant_type, t.move_in_date,
        COALESCE(t.status, 'active') AS status, t.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name
      FROM tenants t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE ${whereClause}
      ORDER BY t.id DESC
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, active_count: 0, vacated_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, active_count: 0, vacated_count: 0 },
      pagination: { page: pageNum, limit: limitNum, totalRecords: Number(total || 0), totalPages: Math.ceil(total / limitNum) || 1 },
      data: rows,
    });
  } catch (err) {
    console.error("Error in getTenantReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch tenant report", error: err.message });
  }
};

/* ==========================================================================
   8C. OWNER REPORT
   ========================================================================== */

exports.getOwnerReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "o", "assigned_to", "created_by");
    const { page = 1, limit = 25, search = "", status = "", city = "", location = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(o.name LIKE ? OR o.email LIKE ? OR o.phone LIKE ? OR o.location LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(COALESCE(o.status, '')) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (city) {
      whereConditions.push("o.city LIKE ?");
      queryParams.push(`%${city.trim()}%`);
    }
    if (location) {
      whereConditions.push("o.location LIKE ?");
      queryParams.push(`%${location.trim()}%`);
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('active', 'published', 'new') OR status IS NULL THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('closed', 'sold', 'rented') THEN 1 ELSE 0 END) AS closed_count
      FROM owners o
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM owners o WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        o.id, o.salutation, o.name, o.phone, o.email, o.city, o.location,
        COALESCE(o.status, 'active') AS status, o.stage, o.deal_value, o.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name
      FROM owners o
      LEFT JOIN users u ON o.assigned_to = u.id
      WHERE ${whereClause}
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, active_count: 0, closed_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, active_count: 0, closed_count: 0 },
      pagination: { page: pageNum, limit: limitNum, totalRecords: Number(total || 0), totalPages: Math.ceil(total / limitNum) || 1 },
      data: rows,
    });
  } catch (err) {
    console.error("Error in getOwnerReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch owner report", error: err.message });
  }
};

/* ==========================================================================
   9. PROPERTY REPORT
   ========================================================================== */

exports.getPropertyReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "p", "assigned_to", "created_by");
    const { page = 1, limit = 25, search = "", status = "", property_type = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(p.society_name LIKE ? OR p.location_name LIKE ? OR p.city_name LIKE ? OR p.seller_name LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(p.status) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (property_type && property_type !== "all") {
      whereConditions.push("LOWER(p.property_type_name) = ?");
      queryParams.push(property_type.toLowerCase().trim());
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('active', 'available', 'published') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('sold', 'closed') THEN 1 ELSE 0 END) AS sold_count,
        SUM(CASE WHEN DATEDIFF(NOW(), created_at) > 90 AND LOWER(COALESCE(status, '')) IN ('active', 'available') THEN 1 ELSE 0 END) AS stale_count
      FROM my_properties p
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM my_properties p WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        p.id, p.seller_name, p.property_type_name, p.property_subtype_name,
        p.bedrooms, p.bathrooms, p.carpet_area, p.city_name, p.location_name, p.society_name,
        p.budget, p.final_price, p.status, p.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name,
        DATEDIFF(NOW(), p.created_at) AS days_on_market
      FROM my_properties p
      LEFT JOIN users u ON p.assigned_to = u.id
      WHERE ${whereClause}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, active_count: 0, sold_count: 0, stale_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, active_count: 0, sold_count: 0, stale_count: 0 },
      pagination: { page: pageNum, limit: limitNum, totalRecords: Number(total || 0), totalPages: Math.ceil(total / limitNum) || 1 },
      data: rows,
    });
  } catch (err) {
    console.error("Error in getPropertyReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch property report", error: err.message });
  }
};

/* ==========================================================================
   10. PROPERTY VISIT REPORT
   ========================================================================== */

exports.getPropertyVisitReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "v", "executive_id", "executive_id");
    const { page = 1, limit = 25, status = "", search = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(v.buyer_name LIKE ? OR v.property_title LIKE ? OR v.seller_name LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(v.status) = ?");
      queryParams.push(status.toLowerCase().trim());
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
      FROM property_visits v
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM property_visits v WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        v.id, v.buyer_name, v.seller_name, v.property_title, v.visit_datetime,
        v.visit_type, v.status, v.rating, v.feedback, v.outcome,
        CONCAT_WS(' ', u.first_name, u.last_name) AS executive_name
      FROM property_visits v
      LEFT JOIN users u ON v.executive_id = u.id
      WHERE ${whereClause}
      ORDER BY v.visit_datetime DESC
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, completed_count: 0, scheduled_count: 0, cancelled_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, completed_count: 0, scheduled_count: 0, cancelled_count: 0 },
      pagination: { page: pageNum, limit: limitNum, totalRecords: Number(total || 0), totalPages: Math.ceil(total / limitNum) || 1 },
      data: rows,
    });
  } catch (err) {
    console.error("Error in getPropertyVisitReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch property visit report", error: err.message });
  }
};

/* ==========================================================================
   11. TRANSACTIONS / RECEIPTS REPORT
   ========================================================================== */

exports.getTransactionReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "r", "created_by", "created_by");
    const { status = "", min_amount, max_amount, search = "" } = req.query;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(r.receipt_id LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("(LOWER(COALESCE(r.status, '')) = ? OR LOWER(COALESCE(r.payment_status, '')) = ?)");
      const st = status.toLowerCase().trim();
      queryParams.push(st, st);
    }
    if (min_amount) {
      whereConditions.push("r.amount >= ?");
      queryParams.push(Number(min_amount));
    }
    if (max_amount) {
      whereConditions.push("r.amount <= ?");
      queryParams.push(Number(max_amount));
    }

    const whereClause = whereConditions.join(" AND ");

    const sql = `
      SELECT 
        r.id, r.receipt_id, r.amount, r.payment_date, r.receipt_date, r.status, r.payment_status,
        r.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS created_by_name
      FROM property_payment_receipts r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE ${whereClause}
      ORDER BY r.id DESC
      LIMIT 100
    `;

    const [rows] = await db.query(sql, queryParams).catch(() => [[]]);
    const totalAmount = rows.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    res.status(200).json({
      success: true,
      stats: { total_count: rows.length, total_amount: totalAmount },
      summary: { totalReceipts: rows.length, totalAmount, brokerageCommission: "N/A" },
      data: rows,
    });
  } catch (err) {
    console.error("Error in getTransactionReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch transaction report", error: err.message });
  }
};

/* ==========================================================================
   12. ACTIVITY & FOLLOWUP REPORT
   ========================================================================== */

exports.getActivityReport = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "a", "user_id", "user_id");
    const {
      status = "",
      activity_type = "",
      search = "",
      assigned_executive = "",
      created_by = "",
      department = "",
      lead_type = "",
      startDate = "",
      endDate = "",
      ignoreDate = "true"
    } = req.query;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(a.description LIKE ? OR a.type LIKE ? OR a.target_lead_name LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(COALESCE(a.status, '')) LIKE ?");
      queryParams.push(`%${status.toLowerCase().trim()}%`);
    }
    if (activity_type && activity_type !== "all") {
      whereConditions.push("LOWER(COALESCE(a.type, '')) LIKE ?");
      queryParams.push(`%${activity_type.toLowerCase().trim()}%`);
    }
    if (lead_type && lead_type !== "all") {
      whereConditions.push("LOWER(COALESCE(a.lead_type_tag, '')) LIKE ?");
      queryParams.push(`%${lead_type.toLowerCase().trim()}%`);
    }
    const targetUserId = assigned_executive && assigned_executive !== "all" ? assigned_executive : (created_by && created_by !== "all" ? created_by : "");
    if (targetUserId) {
      whereConditions.push("a.user_id = ?");
      queryParams.push(targetUserId);
    }
    if (department && department !== "all") {
      whereConditions.push("LOWER(COALESCE(u.department, '')) LIKE ?");
      queryParams.push(`%${department.toLowerCase().trim()}%`);
    }
    if (String(ignoreDate) !== "true" && startDate) {
      whereConditions.push("a.created_at >= ?");
      queryParams.push(`${startDate} 00:00:00`);
    }
    if (String(ignoreDate) !== "true" && endDate) {
      whereConditions.push("a.created_at <= ?");
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(a.type, '')) LIKE '%call%' THEN 1 ELSE 0 END) AS call_count,
        SUM(CASE WHEN LOWER(COALESCE(a.type, '')) LIKE '%meet%' THEN 1 ELSE 0 END) AS meeting_count,
        SUM(CASE WHEN LOWER(COALESCE(a.type, '')) LIKE '%wa%' OR LOWER(COALESCE(a.type, '')) LIKE '%whatsapp%' THEN 1 ELSE 0 END) AS whatsapp_count,
        SUM(CASE WHEN LOWER(COALESCE(a.status, '')) IN ('completed', 'done', 'qualified') THEN 1 ELSE 0 END) AS completed_count
      FROM (
        SELECT id, user_id, title AS description, activity_type AS type, status, scheduled_date, created_at FROM activities
        UNION ALL
        SELECT id, created_by AS user_id, COALESCE(remark, customRemark, next_action, 'Followup') AS description, type, status, scheduled_date, created_at FROM followups
        UNION ALL
        SELECT id, created_by AS user_id, COALESCE(remark, custom_remark, next_action, 'Buyer Followup') AS description, followup_type AS type, buyer_lead_status AS status, schedule_date AS scheduled_date, created_at FROM buyer_followups
        UNION ALL
        SELECT id, created_by AS user_id, COALESCE(remark, custom_remark, next_action, 'Seller Followup') AS description, followup_type AS type, status, schedule_date AS scheduled_date, created_at FROM seller_followups
      ) a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE ${whereClause}
    `;

    const listSql = `
      SELECT 
        a.id, a.type, a.description, a.status, a.scheduled_date, a.created_at, a.lead_type_tag, a.target_lead_name,
        CONCAT_WS(' ', u.first_name, u.last_name) AS user_name
      FROM (
        SELECT 
          act.id, act.user_id,
          CAST(act.title AS CHAR CHARACTER SET utf8mb4) AS description,
          CAST(act.activity_type AS CHAR CHARACTER SET utf8mb4) AS type,
          CAST(act.status AS CHAR CHARACTER SET utf8mb4) AS status,
          act.scheduled_date, act.created_at,
          CAST('General Activity' AS CHAR CHARACTER SET utf8mb4) AS lead_type_tag,
          CAST(COALESCE(l.name, b.name, s.name, o.name, t.name, 'General Lead') AS CHAR CHARACTER SET utf8mb4) AS target_lead_name
        FROM activities act
        LEFT JOIN client_leads l ON act.lead_id = l.id
        LEFT JOIN buyers b ON act.lead_id = b.id
        LEFT JOIN sellers s ON act.lead_id = s.id
        LEFT JOIN owners o ON act.lead_id = o.id
        LEFT JOIN tenants t ON act.lead_id = t.id

        UNION ALL

        SELECT 
          f.id, f.created_by AS user_id,
          CAST(COALESCE(f.remark, f.customRemark, f.next_action, 'Followup Note') AS CHAR CHARACTER SET utf8mb4) AS description,
          CAST(COALESCE(f.type, 'Followup') AS CHAR CHARACTER SET utf8mb4) AS type,
          CAST(f.status AS CHAR CHARACTER SET utf8mb4) AS status,
          f.scheduled_date, f.created_at,
          CAST('Client Lead' AS CHAR CHARACTER SET utf8mb4) AS lead_type_tag,
          CAST(COALESCE(l.name, 'Client Lead') AS CHAR CHARACTER SET utf8mb4) AS target_lead_name
        FROM followups f
        LEFT JOIN client_leads l ON f.lead_id = l.id

        UNION ALL

        SELECT 
          bf.id, bf.created_by AS user_id,
          CAST(COALESCE(bf.remark, bf.custom_remark, bf.next_action, 'Buyer Followup') AS CHAR CHARACTER SET utf8mb4) AS description,
          CAST(COALESCE(bf.followup_type, 'Buyer Followup') AS CHAR CHARACTER SET utf8mb4) AS type,
          CAST(bf.buyer_lead_status AS CHAR CHARACTER SET utf8mb4) AS status,
          bf.schedule_date AS scheduled_date, bf.created_at,
          CAST('Buyer Lead' AS CHAR CHARACTER SET utf8mb4) AS lead_type_tag,
          CAST(COALESCE(b.name, 'Buyer Lead') AS CHAR CHARACTER SET utf8mb4) AS target_lead_name
        FROM buyer_followups bf
        LEFT JOIN buyers b ON bf.buyer_id = b.id

        UNION ALL

        SELECT 
          sf.id, sf.created_by AS user_id,
          CAST(COALESCE(sf.remark, sf.custom_remark, sf.next_action, 'Seller Followup') AS CHAR CHARACTER SET utf8mb4) AS description,
          CAST(COALESCE(sf.followup_type, 'Seller Followup') AS CHAR CHARACTER SET utf8mb4) AS type,
          CAST(sf.status AS CHAR CHARACTER SET utf8mb4) AS status,
          sf.schedule_date AS scheduled_date, sf.created_at,
          CAST('Seller Lead' AS CHAR CHARACTER SET utf8mb4) AS lead_type_tag,
          CAST(COALESCE(s.name, 'Seller Lead') AS CHAR CHARACTER SET utf8mb4) AS target_lead_name
        FROM seller_followups sf
        LEFT JOIN sellers s ON sf.seller_id = s.id
      ) a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT 200
    `;

    let userSummaryConditions = [
      "LOWER(u.role) NOT IN ('buyer', 'seller', 'owner', 'tenant', 'client')",
      "(u.is_active = 1 OR u.is_active IS NULL)"
    ];
    let userSummaryParams = [];

    if (targetUserId) {
      userSummaryConditions.push("u.id = ?");
      userSummaryParams.push(targetUserId);
    }
    if (department && department !== "all") {
      userSummaryConditions.push("LOWER(COALESCE(u.department, '')) LIKE ?");
      userSummaryParams.push(`%${department.toLowerCase().trim()}%`);
    }

    const userSummaryWhere = userSummaryConditions.join(" AND ");

    const userSummarySql = `
      SELECT 
        u.id AS user_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
        u.email, u.phone, u.role, u.department,
        CASE WHEN u.is_active = 1 THEN 'active' ELSE 'inactive' END AS user_status,
        COALESCE(u.is_active, 1) AS is_active,

        -- Categorized Lead Assignment Counts
        COALESCE(leads_cnt.general_leads, 0) AS general_leads,
        COALESCE(buyers_cnt.buyer_leads, 0) AS buyer_leads,
        COALESCE(sellers_cnt.seller_leads, 0) AS seller_leads,
        COALESCE(owners_cnt.owner_leads, 0) AS owner_leads,
        COALESCE(tenants_cnt.tenant_leads, 0) AS tenant_leads,

        (COALESCE(leads_cnt.general_leads, 0) + 
         COALESCE(buyers_cnt.buyer_leads, 0) + 
         COALESCE(sellers_cnt.seller_leads, 0) + 
         COALESCE(owners_cnt.owner_leads, 0) + 
         COALESCE(tenants_cnt.tenant_leads, 0)) AS assigned_leads,

        -- Lead Status Aggregates Across All Lead Types
        (COALESCE(leads_cnt.contacted, 0) + COALESCE(buyers_cnt.contacted, 0) + COALESCE(sellers_cnt.contacted, 0) + COALESCE(owners_cnt.contacted, 0) + COALESCE(tenants_cnt.contacted, 0)) AS contacted_leads,
        (COALESCE(leads_cnt.pending, 0) + COALESCE(buyers_cnt.pending, 0) + COALESCE(sellers_cnt.pending, 0) + COALESCE(owners_cnt.pending, 0) + COALESCE(tenants_cnt.pending, 0)) AS pending_calls,
        (COALESCE(leads_cnt.interested, 0) + COALESCE(buyers_cnt.interested, 0) + COALESCE(sellers_cnt.interested, 0) + COALESCE(owners_cnt.interested, 0) + COALESCE(tenants_cnt.interested, 0)) AS interested_leads,
        (COALESCE(leads_cnt.not_interested, 0) + COALESCE(buyers_cnt.not_interested, 0) + COALESCE(sellers_cnt.not_interested, 0) + COALESCE(owners_cnt.not_interested, 0) + COALESCE(tenants_cnt.not_interested, 0)) AS not_interested_leads,

        -- Activity, Visits & Followups Logged
        COALESCE(act_cnt.calls_done, 0) AS calls_done,
        COALESCE(act_cnt.visits_done, 0) AS visits_done,
        (COALESCE(followup_cnt.cnt, 0) + COALESCE(buyer_flw_cnt.cnt, 0) + COALESCE(seller_flw_cnt.cnt, 0)) AS followups_count,
        (COALESCE(followup_cnt.overdue, 0) + COALESCE(buyer_flw_cnt.overdue, 0) + COALESCE(seller_flw_cnt.overdue, 0)) AS overdue_followups,

        -- Last Activity Timestamp
        GREATEST(
          COALESCE(act_cnt.last_act, '1970-01-01 00:00:00'),
          COALESCE(followup_cnt.last_flw, '1970-01-01 00:00:00'),
          COALESCE(buyer_flw_cnt.last_flw, '1970-01-01 00:00:00'),
          COALESCE(seller_flw_cnt.last_flw, '1970-01-01 00:00:00')
        ) AS last_activity_at

      FROM users u

      -- General CRM Leads
      LEFT JOIN (
        SELECT assigned_executive,
          COUNT(id) AS general_leads,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%contact%' OR LOWER(COALESCE(status, '')) LIKE '%follow%' THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('new', 'fresh', 'uncontacted') OR status IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%interest%' OR LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS interested,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('not interested', 'lost', 'rejected', 'unqualified') THEN 1 ELSE 0 END) AS not_interested
        FROM client_leads
        WHERE assigned_executive IS NOT NULL
        GROUP BY assigned_executive
      ) leads_cnt ON leads_cnt.assigned_executive = u.id

      -- Buyers
      LEFT JOIN (
        SELECT assigned_executive,
          COUNT(id) AS buyer_leads,
          SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) LIKE '%contact%' OR LOWER(COALESCE(buyer_lead_status, '')) LIKE '%follow%' THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) IN ('new', 'fresh', 'active') OR buyer_lead_status IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) LIKE '%interest%' OR LOWER(COALESCE(buyer_lead_status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS interested,
          SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) IN ('not interested', 'lost', 'rejected') THEN 1 ELSE 0 END) AS not_interested
        FROM buyers
        WHERE assigned_executive IS NOT NULL
        GROUP BY assigned_executive
      ) buyers_cnt ON buyers_cnt.assigned_executive = u.id

      -- Sellers
      LEFT JOIN (
        SELECT assigned_to,
          COUNT(id) AS seller_leads,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%contact%' OR LOWER(COALESCE(status, '')) LIKE '%follow%' THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('new', 'fresh', 'active') OR status IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%interest%' OR LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS interested,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('not interested', 'lost', 'rejected') THEN 1 ELSE 0 END) AS not_interested
        FROM sellers
        WHERE assigned_to IS NOT NULL
        GROUP BY assigned_to
      ) sellers_cnt ON sellers_cnt.assigned_to = u.id

      -- Owners
      LEFT JOIN (
        SELECT assigned_to,
          COUNT(id) AS owner_leads,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%contact%' OR LOWER(COALESCE(status, '')) LIKE '%follow%' THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('new', 'fresh', 'active') OR status IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%interest%' OR LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS interested,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('not interested', 'lost', 'rejected') THEN 1 ELSE 0 END) AS not_interested
        FROM owners
        WHERE assigned_to IS NOT NULL
        GROUP BY assigned_to
      ) owners_cnt ON owners_cnt.assigned_to = u.id

      -- Tenants
      LEFT JOIN (
        SELECT assigned_to,
          COUNT(id) AS tenant_leads,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%contact%' OR LOWER(COALESCE(status, '')) LIKE '%follow%' THEN 1 ELSE 0 END) AS contacted,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('new', 'fresh', 'active') OR status IS NULL THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%interest%' OR LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS interested,
          SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('not interested', 'lost', 'rejected') THEN 1 ELSE 0 END) AS not_interested
        FROM tenants
        WHERE assigned_to IS NOT NULL
        GROUP BY assigned_to
      ) tenants_cnt ON tenants_cnt.assigned_to = u.id

      -- Activities (Calls & Visits)
      LEFT JOIN (
        SELECT user_id,
          SUM(CASE WHEN LOWER(COALESCE(activity_type, '')) LIKE '%call%' THEN 1 ELSE 0 END) AS calls_done,
          SUM(CASE WHEN LOWER(COALESCE(activity_type, '')) LIKE '%visit%' OR LOWER(COALESCE(activity_type, '')) LIKE '%meet%' THEN 1 ELSE 0 END) AS visits_done,
          MAX(created_at) AS last_act
        FROM activities
        GROUP BY user_id
      ) act_cnt ON act_cnt.user_id = u.id

      -- Followups (General)
      LEFT JOIN (
        SELECT created_by,
          COUNT(id) AS cnt,
          SUM(CASE WHEN scheduled_date < NOW() AND LOWER(COALESCE(status, '')) IN ('pending', 'scheduled', 'open') THEN 1 ELSE 0 END) AS overdue,
          MAX(created_at) AS last_flw
        FROM followups
        GROUP BY created_by
      ) followup_cnt ON followup_cnt.created_by = u.id

      -- Followups (Buyer)
      LEFT JOIN (
        SELECT created_by,
          COUNT(id) AS cnt,
          SUM(CASE WHEN schedule_date < NOW() AND LOWER(COALESCE(buyer_lead_status, '')) IN ('pending', 'scheduled', 'open') THEN 1 ELSE 0 END) AS overdue,
          MAX(created_at) AS last_flw
        FROM buyer_followups
        GROUP BY created_by
      ) buyer_flw_cnt ON buyer_flw_cnt.created_by = u.id

      -- Followups (Seller)
      LEFT JOIN (
        SELECT created_by,
          COUNT(id) AS cnt,
          SUM(CASE WHEN schedule_date < NOW() AND LOWER(COALESCE(status, '')) IN ('pending', 'scheduled', 'open') THEN 1 ELSE 0 END) AS overdue,
          MAX(created_at) AS last_flw
        FROM seller_followups
        GROUP BY created_by
      ) seller_flw_cnt ON seller_flw_cnt.created_by = u.id

      WHERE ${userSummaryWhere}

      ORDER BY assigned_leads DESC, followups_count DESC;
    `;

    const [[[statsData]], [rows], [userSummaryRows]] = await Promise.all([
      db.query(statsSql, queryParams).catch((err) => {
        console.error("Activity stats error:", err);
        return [[{ total_count: 0, call_count: 0, meeting_count: 0, whatsapp_count: 0, completed_count: 0 }]];
      }),
      db.query(listSql, queryParams).catch((err) => {
        console.error("Activity list error:", err);
        return [[]];
      }),
      db.query(userSummarySql, userSummaryParams).catch((err) => {
        console.error("User activity summary error:", err);
        return [[]];
      }),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, call_count: 0, meeting_count: 0, whatsapp_count: 0, completed_count: 0 },
      data: rows,
      userSummary: userSummaryRows || [],
    });
  } catch (err) {
    console.error("Error in getActivityReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch activity report", error: err.message });
  }
};

/* ==========================================================================
   13. COMMUNICATION REPORT
   ========================================================================== */

exports.getCommunicationReport = async (req, res) => {
  try {
    const { direction = "" } = req.query;
    let whereClause = "1=1";
    let params = [];

    if (direction && direction !== "all") {
      if (direction === "inbound") {
        whereClause = "LOWER(COALESCE(direction, '')) IN ('in', 'inbound')";
      } else if (direction === "outbound") {
        whereClause = "LOWER(COALESCE(direction, '')) IN ('out', 'outbound')";
      }
    }

    const sql = `
      SELECT 
        COUNT(*) AS total_messages,
        SUM(CASE WHEN LOWER(COALESCE(direction, '')) IN ('in', 'inbound') THEN 1 ELSE 0 END) AS inbound_count,
        SUM(CASE WHEN LOWER(COALESCE(direction, '')) IN ('out', 'outbound') THEN 1 ELSE 0 END) AS outbound_count,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count
      FROM messages_wa
      WHERE ${whereClause}
    `;

    let summary = { total_messages: 0, inbound_count: 0, outbound_count: 0, unread_count: 0 };
    try {
      const [[row]] = await db.query(sql, params);
      if (row) summary = row;
    } catch (e) {
      console.error("Communication report query error:", e);
    }

    res.status(200).json({
      success: true,
      stats: summary,
      summary,
    });
  } catch (err) {
    console.error("Error in getCommunicationReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch communication report", error: err.message });
  }
};

/* ==========================================================================
   14. CAMPAIGN REPORT
   ========================================================================== */

exports.getCampaignReport = async (req, res) => {
  try {
    const { status = "", search = "" } = req.query;
    let whereConditions = ["1=1"];
    let queryParams = [];

    if (search) {
      whereConditions.push("c.name LIKE ?");
      queryParams.push(`%${search.trim()}%`);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(COALESCE(c.status, '')) = ?");
      queryParams.push(status.toLowerCase().trim());
    }

    const whereClause = whereConditions.join(" AND ");

    const sql = `
      SELECT 
        c.id, c.name, COALESCE(c.audience_mode, 'broadcast') AS type, c.status,
        COALESCE(c.total_contacts, 0) AS total_leads, c.sent_count, c.delivered_count,
        c.read_count, c.failed_count, c.created_at
      FROM campaigns c
      WHERE ${whereClause}
      ORDER BY c.id DESC
      LIMIT 50
    `;

    let campaigns = [];
    try {
      const [rows] = await db.query(sql, queryParams);
      campaigns = rows;
    } catch (e) {
      console.error("Campaign report query error:", e);
    }

    const totalAudience = campaigns.reduce((acc, curr) => acc + Number(curr.total_leads || 0), 0);

    res.status(200).json({
      success: true,
      stats: { total_campaigns: campaigns.length, total_audience: totalAudience },
      campaigns,
    });
  } catch (err) {
    console.error("Error in getCampaignReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch campaign report", error: err.message });
  }
};

/* ==========================================================================
   15. DOCUMENT REPORT (DEPRECATED)
   ========================================================================== */

exports.getDocumentReport = async (req, res) => {
  res.status(200).json({ success: true, message: "Document report removed" });
};

/* ==========================================================================
   16. AUTOMATION REPORT (DEPRECATED)
   ========================================================================== */

exports.getAutomationReport = async (req, res) => {
  res.status(200).json({ success: true, message: "Automation report removed" });
};

/* ==========================================================================
   17. AI INSIGHTS
   ========================================================================== */

exports.getAiInsights = async (req, res) => {
  try {
    const scope = getRoleScopedWhere(req, "", "assigned_executive", "created_by");

    const [[leadData]] = await db.query(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified,
        SUM(CASE WHEN LOWER(COALESCE(status, '')) IN ('closed', 'won') THEN 1 ELSE 0 END) AS closed
       FROM client_leads WHERE ${scope.sql}`,
      scope.params
    ).catch(() => [[{ total: 0, qualified: 0, closed: 0 }]]);

    const total = Number(leadData?.total || 0);
    const qualified = Number(leadData?.qualified || 0);
    const closed = Number(leadData?.closed || 0);

    try {
      const apiKey = await Integration.getSetting("chatgpt", "api_key");
      const model = (await Integration.getSetting("chatgpt", "model")) || "gpt-4o-mini";

      if (apiKey) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.5,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "You are a real estate business intelligence advisor. Output strict JSON with key 'insights': array of strings (3-5 concise bullet recommendations).",
              },
              {
                role: "user",
                content: `Real estate performance metrics: Total Leads: ${total}, Qualified Leads: ${qualified}, Closed Deals: ${closed}. Provide actionable recommendations.`,
              },
            ],
          }),
        });

        const json = await response.json();
        const parsed = JSON.parse(json?.choices?.[0]?.message?.content || "{}");
        if (parsed.insights && Array.isArray(parsed.insights)) {
          return res.status(200).json({ success: true, aiGenerated: true, insights: parsed.insights });
        }
      }
    } catch (_) { }

    const fallbackInsights = [
      `Lead pipeline has ${total} total record(s) registered. Focus sales execution on qualifying incoming inquiries.`,
      `Qualified leads stand at ${qualified}. Schedule immediate site visits to drive transaction progress.`,
      `Track agent performance metrics continuously to increase conversion from visit to closed deal.`,
    ];

    res.status(200).json({
      success: true,
      aiGenerated: false,
      insights: fallbackInsights,
    });
  } catch (err) {
    console.error("Error in getAiInsights:", err);
    res.status(500).json({ success: false, message: "Failed to generate AI insights", error: err.message });
  }
};

/* ==========================================================================
   18. EXPORT REPORT CSV
   ========================================================================== */

exports.exportReport = async (req, res) => {
  try {
    const { type = "leads" } = req.query;
    const scope = getRoleScopedWhere(req, "l", "assigned_executive", "created_by");

    const sql = `
      SELECT 
        l.id, l.name, l.phone, l.email, l.lead_type, l.lead_source, l.status, l.priority,
        l.city, l.location, l.created_at
      FROM client_leads l
      WHERE ${scope.sql}
      ORDER BY l.id DESC
    `;

    const [rows] = await db.query(sql, scope.params).catch(() => [[]]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="report_${type}_${Date.now()}.csv"`);

    let csv = "ID,Name,Phone,Email,Type,Source,Status,Priority,City,Location,Created Date\n";
    rows.forEach((r) => {
      csv += `"${r.id}","${r.name || ""}","${r.phone || ""}","${r.email || ""}","${r.lead_type || ""}","${r.lead_source || ""}","${r.status || ""}","${r.priority || ""}","${r.city || ""}","${r.location || ""}","${r.created_at || ""}"\n`;
    });

    res.status(200).send(csv);
  } catch (err) {
    console.error("Error in exportReport:", err);
    res.status(500).json({ success: false, message: "Failed to export report", error: err.message });
  }
};

/* ==========================================================================
   19. LOGIN AUDIT LOGS & SESSION REPORT
   ========================================================================== */

const LoginLog = require("../models/LoginLog");

exports.getLoginLogReport = async (req, res) => {
  try {
    const db = require("../config/database");
    // Auto-close any stale active sessions where logout was not captured and last activity was over 1 hour ago
    await db.query(`
      UPDATE login_logs 
      SET logout_time = COALESCE(last_activity, login_time),
          session_duration = GREATEST(TIMESTAMPDIFF(SECOND, login_time, COALESCE(last_activity, login_time)), 10)
      WHERE logout_time IS NULL 
        AND (
          COALESCE(last_activity, login_time) < DATE_SUB(NOW(), INTERVAL 1 HOUR)
          OR login_time < DATE_SUB(NOW(), INTERVAL 12 HOUR)
        )
    `);

    const { role = "all", search = "", startDate, endDate, ignoreDate } = req.query;
    const stats = await LoginLog.getStats();
    const logs = await LoginLog.getAllLogs({ role, search, startDate, endDate, ignoreDate: ignoreDate === "true" || ignoreDate === true });

    res.status(200).json({
      success: true,
      stats,
      logs,
      data: logs,
      pagination: {
        page: 1,
        limit: logs.length || 25,
        totalRecords: logs.length || 0,
        totalPages: 1,
      },
    });
  } catch (err) {
    console.error("Error in getLoginLogReport:", err);
    res.status(500).json({ success: false, message: "Failed to fetch login audit logs report", error: err.message });
  }
};
