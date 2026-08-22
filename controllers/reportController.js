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

  if (ignoreDate === "true" || ignoreDate === "1" || ignoreDate === true) {
    return {
      ignoreDate: true,
      startStr: "2000-01-01 00:00:00",
      endStr: formatMySQLDateTime(end),
      prevStartStr: "2000-01-01 00:00:00",
      prevEndStr: formatMySQLDateTime(end),
    };
  }

  const preset = (datePreset || "alltime").toLowerCase().trim();

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
    ignoreDate: preset === "alltime",
    startStr: formatMySQLDateTime(start),
    endStr: formatMySQLDateTime(end),
    prevStartStr: formatMySQLDateTime(prevStart),
    prevEndStr: formatMySQLDateTime(prevEnd),
  };
}

function getRoleScopedWhere(req, prefix = "", userCol = "assigned_executive", createdByCol = "created_by") {
  const role = String(req.userRole || "").toLowerCase().trim();
  const colUser = prefix ? `${prefix}.${userCol}` : userCol;
  const colCreated = prefix ? `${prefix}.${createdByCol}` : createdByCol;

  if (role === "admin") {
    return { sql: "1=1", params: [] };
  }

  if (role === "manager" || role === "team leader") {
    const dept = req.user && req.user.department ? req.user.department : null;
    if (dept) {
      return {
        sql: `(${colUser} IN (SELECT id FROM users WHERE department = ?) OR ${colCreated} = ?)`,
        params: [dept, req.userId],
      };
    }
    return {
      sql: `(${colUser} = ? OR ${colCreated} = ?)`,
      params: [req.userId, req.userId],
    };
  }

  return {
    sql: `(${colUser} = ? OR ${colCreated} = ?)`,
    params: [req.userId, req.userId],
  };
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
      source = "",
      lead_type = "",
      priority = "",
      assigned_executive = "",
      created_by = "",
      sort_by = "newest",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (!ignoreDate && req.query.startDate && req.query.endDate) {
      whereConditions.push("l.created_at BETWEEN ? AND ?");
      queryParams.push(startStr, endStr);
    }

    if (search) {
      whereConditions.push("(l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ? OR l.location LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(l.status) = ?");
      queryParams.push(status.toLowerCase().trim());
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
      whereConditions.push("l.assigned_executive = ?");
      queryParams.push(assigned_executive);
    }
    if (created_by && created_by !== "all") {
      whereConditions.push("l.created_by = ?");
      queryParams.push(created_by);
    }

    const whereClause = whereConditions.join(" AND ");
    const orderBy = sort_by === "oldest" ? "l.id ASC" : "l.id DESC";

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('new', 'fresh', 'uncontacted') THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%contact%' THEN 1 ELSE 0 END) AS contacted_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('unqualified', 'lost', 'rejected') THEN 1 ELSE 0 END) AS unqualified_count
      FROM client_leads l
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM client_leads l WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        l.id, l.salutation, l.name, l.phone, l.email, l.lead_type, l.lead_source,
        l.status, l.priority, l.city, l.location, l.whatsapp_number, l.created_at, l.updated_at,
        l.assigned_executive,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_executive_name,
        DATEDIFF(NOW(), l.created_at) AS age_days
      FROM client_leads l
      LEFT JOIN users u ON l.assigned_executive = u.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, new_count: 0, contacted_count: 0, qualified_count: 0, unqualified_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, new_count: 0, contacted_count: 0, qualified_count: 0, unqualified_count: 0 },
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords: Number(total || 0),
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data: rows,
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
    const scope = getRoleScopedWhere(req, "b", "assigned_executive", "assigned_executive");
    const { page = 1, limit = 25, search = "", status = "", budget_min, budget_max, location } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(b.name LIKE ? OR b.email LIKE ? OR b.phone LIKE ? OR b.location LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(b.buyer_lead_status) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (location) {
      whereConditions.push("(b.location LIKE ? OR b.city LIKE ?)");
      const loc = `%${location.trim()}%`;
      queryParams.push(loc, loc);
    }
    if (budget_min) {
      whereConditions.push("b.budget_min >= ?");
      queryParams.push(Number(budget_min));
    }
    if (budget_max) {
      whereConditions.push("b.budget_max <= ?");
      queryParams.push(Number(budget_max));
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) IN ('new', 'active') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS qualified_count,
        SUM(CASE WHEN LOWER(COALESCE(buyer_lead_status, '')) IN ('closed', 'converted') THEN 1 ELSE 0 END) AS converted_count
      FROM buyers b
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM buyers b WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        b.id, b.salutation, b.name, b.phone, b.email, b.city, b.location,
        b.buyer_lead_status, b.buyer_lead_stage, b.buyer_lead_priority,
        b.budget_min, b.budget_max, b.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name
      FROM buyers b
      LEFT JOIN users u ON b.assigned_executive = u.id
      WHERE ${whereClause}
      ORDER BY b.id DESC
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, active_count: 0, qualified_count: 0, converted_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, active_count: 0, qualified_count: 0, converted_count: 0 },
      pagination: { page: pageNum, limit: limitNum, totalRecords: Number(total || 0), totalPages: Math.ceil(total / limitNum) || 1 },
      data: rows,
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
    const { page = 1, limit = 25, search = "", status = "", location } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(s.name LIKE ? OR s.email LIKE ? OR s.phone LIKE ? OR s.location LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s, s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(s.status) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (location) {
      whereConditions.push("(s.location LIKE ? OR s.city LIKE ?)");
      const loc = `%${location.trim()}%`;
      queryParams.push(loc, loc);
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('active', 'published', 'new', 'fresh') THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN LOWER(COALESCE(s.status, '')) IN ('sold', 'closed', 'converted') THEN 1 ELSE 0 END) AS sold_count
      FROM sellers s
      WHERE ${scope.sql}
    `;

    const countSql = `SELECT COUNT(*) AS total FROM sellers s WHERE ${whereClause}`;

    const dataSql = `
      SELECT 
        s.id, s.salutation, s.name, s.phone, s.email, s.city, s.location,
        COALESCE(s.status, 'active') AS seller_lead_status, s.stage AS seller_lead_stage,
        COALESCE(MAX(p.final_price), MAX(p.budget), s.deal_value, 0) AS expected_price, s.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_agent_name,
        DATEDIFF(NOW(), s.created_at) AS days_listed
      FROM sellers s
      LEFT JOIN my_properties p ON (p.seller_id = s.id OR LOWER(TRIM(p.seller_name)) = LOWER(TRIM(s.name)))
      LEFT JOIN users u ON s.assigned_to = u.id
      WHERE ${whereClause}
      GROUP BY s.id, s.salutation, s.name, s.phone, s.email, s.city, s.location, s.status, s.stage, s.deal_value, s.created_at, u.first_name, u.last_name
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `;

    const [[[statsData]], [[{ total }]], [rows]] = await Promise.all([
      db.query(statsSql, scope.params).catch(() => [[{ total_count: 0, active_count: 0, sold_count: 0 }]]),
      db.query(countSql, queryParams).catch(() => [[{ total: 0 }]]),
      db.query(dataSql, [...queryParams, limitNum, offset]).catch(() => [[]]),
    ]);

    res.status(200).json({
      success: true,
      stats: statsData || { total_count: 0, active_count: 0, sold_count: 0 },
      pagination: { page: pageNum, limit: limitNum, totalRecords: Number(total || 0), totalPages: Math.ceil(total / limitNum) || 1 },
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
    const { status = "", activity_type = "", search = "" } = req.query;

    let whereConditions = [scope.sql];
    let queryParams = [...scope.params];

    if (search) {
      whereConditions.push("(a.description LIKE ? OR a.type LIKE ?)");
      const s = `%${search.trim()}%`;
      queryParams.push(s, s);
    }
    if (status && status !== "all") {
      whereConditions.push("LOWER(COALESCE(a.status, '')) = ?");
      queryParams.push(status.toLowerCase().trim());
    }
    if (activity_type && activity_type !== "all") {
      whereConditions.push("LOWER(COALESCE(a.type, '')) LIKE ?");
      queryParams.push(`%${activity_type.toLowerCase().trim()}%`);
    }

    const whereClause = whereConditions.join(" AND ");

    const statsSql = `
      SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN LOWER(COALESCE(a.type, '')) LIKE '%call%' THEN 1 ELSE 0 END) AS call_count,
        SUM(CASE WHEN LOWER(COALESCE(a.type, '')) LIKE '%meet%' THEN 1 ELSE 0 END) AS meeting_count,
        SUM(CASE WHEN LOWER(COALESCE(a.type, '')) LIKE '%wa%' OR LOWER(COALESCE(a.type, '')) LIKE '%whatsapp%' THEN 1 ELSE 0 END) AS whatsapp_count,
        SUM(CASE WHEN LOWER(COALESCE(a.status, '')) IN ('completed', 'done') THEN 1 ELSE 0 END) AS completed_count
      FROM (
        SELECT id, user_id, title AS description, activity_type AS type, status, scheduled_date, created_at FROM activities
        UNION ALL
        SELECT id, created_by AS user_id, COALESCE(remark, customRemark, next_action, 'Followup') AS description, type, status, scheduled_date, created_at FROM followups
      ) a
      WHERE ${scope.sql}
    `;

    const listSql = `
      SELECT 
        a.id, a.type, a.description, a.status, a.scheduled_date, a.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS user_name
      FROM (
        SELECT id, user_id, title AS description, activity_type AS type, status, scheduled_date, created_at FROM activities
        UNION ALL
        SELECT id, created_by AS user_id, COALESCE(remark, customRemark, next_action, 'Followup') AS description, type, status, scheduled_date, created_at FROM followups
      ) a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE ${whereClause}
      ORDER BY a.id DESC
      LIMIT 100
    `;

    const userSummarySql = `
      SELECT 
        u.id AS user_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS user_name,
        u.email, u.phone, u.role, u.department,
        COUNT(DISTINCT l.id) AS assigned_leads,
        SUM(CASE WHEN LOWER(COALESCE(act.activity_type, '')) LIKE '%call%' THEN 1 ELSE 0 END) AS calls_done,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('new', 'fresh', 'uncontacted') THEN 1 ELSE 0 END) AS pending_calls,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) LIKE '%interest%' OR LOWER(COALESCE(l.status, '')) LIKE '%qualif%' THEN 1 ELSE 0 END) AS interested_leads,
        SUM(CASE WHEN LOWER(COALESCE(l.status, '')) IN ('not interested', 'lost', 'rejected', 'unqualified') THEN 1 ELSE 0 END) AS not_interested_leads,
        COUNT(DISTINCT f.id) AS followups_count
      FROM users u
      LEFT JOIN client_leads l ON l.assigned_executive = u.id
      LEFT JOIN activities act ON act.user_id = u.id
      LEFT JOIN followups f ON f.created_by = u.id
      WHERE LOWER(u.role) NOT IN ('buyer', 'seller', 'owner', 'tenant')
      GROUP BY u.id, user_name, u.email, u.phone, u.role, u.department
      ORDER BY assigned_leads DESC
    `;

    const [[[statsData]], [rows], [userSummaryRows]] = await Promise.all([
      db.query(statsSql, scope.params).catch((err) => {
        console.error("Activity stats error:", err);
        return [[{ total_count: 0, call_count: 0, meeting_count: 0, whatsapp_count: 0, completed_count: 0 }]];
      }),
      db.query(listSql, queryParams).catch((err) => {
        console.error("Activity list error:", err);
        return [[]];
      }),
      db.query(userSummarySql).catch((err) => {
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
    } catch (_) {}

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
