const Lead = require('../models/Lead');
const Property = require('../models/Property');
const Activity = require('../models/Activity');
const User = require('../models/User');

// Get comprehensive dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;
    
    // Get basic stats
    const [leadsStats, propertiesStats, activitiesStats] = await Promise.all([
      Lead.getLeadsStats(),
      Property.getPropertiesStats(),
      Activity.getActivitiesStats(userRole === 'admin' ? null : userId)
    ]);
    
    // Get recent activities
    const recentActivities = await Activity.getAll({
      user_id: userRole === 'admin' ? undefined : userId,
      limit: 10
    });
    
    // Get upcoming activities
    const upcomingActivities = await Activity.getUpcomingActivities(
      userRole === 'admin' ? null : userId,
      7
    );
    
    // Get recent leads
    const recentLeads = await Lead.getAll({
      assigned_agent_id: userRole === 'admin' ? undefined : userId,
      limit: 5
    });
    
    // Get available properties count
    const availableProperties = await Property.getAll({
      status: 'available',
      limit: 5
    });
    
    res.send({
      success: true,
      data: {
        overview: {
          leads: leadsStats,
          properties: propertiesStats,
          activities: activitiesStats
        },
        recentActivities: recentActivities,
        upcomingActivities: upcomingActivities,
        recentLeads: recentLeads,
        availableProperties: availableProperties
      }
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving dashboard statistics.'
    });
  }
};

// Get sales performance data
exports.getSalesPerformance = async (req, res) => {
  try {
    const db = require('../config/db.config');
    
    // Get monthly sales data for the last 12 months
    const salesQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as leads_count,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_count,
        ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END) * 100.0 / COUNT(*), 2) as conversion_rate
      FROM leads 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `;
    
    const propertiesQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as listed_count,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count,
        AVG(price) as avg_price
      FROM properties 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `;
    
    const [salesData, propertiesData] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(salesQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(propertiesQuery, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      })
    ]);
    
    res.send({
      success: true,
      data: {
        sales: salesData,
        properties: propertiesData
      }
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving sales performance data.'
    });
  }
};

// Get lead sources distribution
exports.getLeadSources = async (req, res) => {
  try {
    const db = require('../config/db.config');
    
    const query = `
      SELECT 
        source,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_count,
        ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END) * 100.0 / COUNT(*), 2) as conversion_rate
      FROM leads 
      WHERE source IS NOT NULL
      GROUP BY source
      ORDER BY count DESC
    `;
    
    const data = await new Promise((resolve, reject) => {
      db.query(query, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving lead sources data.'
    });
  }
};

// Get agent performance
exports.getAgentPerformance = async (req, res) => {
  try {
    const db = require('../config/db.config');
    
    const query = `
      SELECT 
        u.id,
        CONCAT(u.first_name, ' ', u.last_name) as agent_name,
        COUNT(l.id) as total_leads,
        COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
        ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END) * 100.0 / COUNT(l.id), 2) as conversion_rate,
        COUNT(p.id) as properties_listed,
        COUNT(CASE WHEN p.status = 'sold' THEN 1 END) as properties_sold
      FROM users u
      LEFT JOIN leads l ON u.id = l.assigned_agent_id
      LEFT JOIN properties p ON u.id = p.listing_agent_id
      WHERE u.role = 'agent' AND u.is_active = true
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY converted_leads DESC
    `;
    
    const data = await new Promise((resolve, reject) => {
      db.query(query, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving agent performance data.'
    });
  }
};

// Get property market analysis
exports.getPropertyMarketAnalysis = async (req, res) => {
  try {
    const db = require('../config/db.config');
    
    const query = `
      SELECT 
        city,
        property_type,
        COUNT(*) as count,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count,
        ROUND(COUNT(CASE WHEN status = 'sold' THEN 1 END) * 100.0 / COUNT(*), 2) as sale_rate
      FROM properties 
      WHERE city IS NOT NULL AND property_type IS NOT NULL
      GROUP BY city, property_type
      ORDER BY city, avg_price DESC
    `;
    
    const data = await new Promise((resolve, reject) => {
      db.query(query, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    res.send({
      success: true,
      data: data
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving property market analysis.'
    });
  }
};

// Get activity timeline
exports.getActivityTimeline = async (req, res) => {
  try {
    const userId = req.query.user_id || (req.userRole === 'admin' ? null : req.userId);
    const days = req.query.days || 30;
    
    const activities = await Activity.getAll({
      user_id: userId,
      date_from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      limit: 100
    });
    
    res.send({
      success: true,
      data: activities
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error retrieving activity timeline.'
    });
  }
};

// Get Executive "Today's Recommended Actions"
exports.getExecutiveRecommendedActions = async (req, res) => {
  try {
    const db = require('../config/database');
    const userId = req.query.user_id || req.userId;

    // A. Lead Followups
    const [leadActions] = await db.execute(`
      SELECT f.id, 'lead' AS entity_type, f.lead_id AS entity_id, l.name AS entity_name, l.phone,
             f.next_action, f.scheduled_date, f.completed_date, COALESCE(l.priority, 'medium') AS priority
      FROM followups f
      JOIN client_leads l ON f.lead_id = l.id
      WHERE (l.assigned_executive = ? OR f.created_by = ?)
        AND f.completed_date IS NULL
        AND (DATE(f.scheduled_date) <= CURDATE() OR f.scheduled_date IS NULL)
      ORDER BY f.scheduled_date ASC
      LIMIT 10
    `, [userId, userId]).catch(() => [[]]);

    // B. Buyer Followups
    const [buyerActions] = await db.execute(`
      SELECT bf.id, 'buyer' AS entity_type, bf.buyer_id AS entity_id, b.name AS entity_name, b.phone,
             bf.next_action, CONCAT(bf.schedule_date, ' ', COALESCE(bf.schedule_time, '00:00:00')) AS scheduled_date,
             bf.completed_date, COALESCE(b.buyer_lead_priority, b.priority, 'medium') AS priority
      FROM buyer_followups bf
      JOIN buyers b ON bf.buyer_id = b.id
      WHERE (b.assigned_executive = ? OR bf.created_by = ?)
        AND bf.completed_date IS NULL
        AND (bf.schedule_date <= CURDATE() OR bf.schedule_date IS NULL)
      ORDER BY bf.schedule_date ASC
      LIMIT 10
    `, [userId, userId]).catch(() => [[]]);

    // C. Seller Followups
    const [sellerActions] = await db.execute(`
      SELECT sf.id, 'seller' AS entity_type, sf.seller_id AS entity_id, s.name AS entity_name, s.phone,
             sf.next_action, CONCAT(sf.schedule_date, ' ', COALESCE(sf.schedule_time, '00:00:00')) AS scheduled_date,
             sf.completed_date, COALESCE(s.priority, 'medium') AS priority
      FROM seller_followups sf
      JOIN sellers s ON sf.seller_id = s.id
      WHERE (s.assigned_to = ? OR sf.created_by = ?)
        AND sf.completed_date IS NULL
        AND (sf.schedule_date <= CURDATE() OR sf.schedule_date IS NULL)
      ORDER BY sf.schedule_date ASC
      LIMIT 10
    `, [userId, userId]).catch(() => [[]]);

    const combinedActions = [...leadActions, ...buyerActions, ...sellerActions].sort((a, b) => {
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      const pA = priorityOrder[String(a.priority).toLowerCase()] || 2;
      const pB = priorityOrder[String(b.priority).toLowerCase()] || 2;
      return pA - pB;
    });

    res.send({
      success: true,
      data: {
        actions: combinedActions,
        total: combinedActions.length,
      }
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error fetching executive recommended actions.'
    });
  }
};

// Get Admin Escalations & High Priority Lead Summary
exports.getAdminEscalations = async (req, res) => {
  try {
    const db = require('../config/database');

    // High Priority Leads/Buyers/Sellers
    const [highPriorityLeads] = await db.execute(`
      SELECT id, name, phone, email, priority, stage, assigned_executive, 'lead' AS entity_type
      FROM client_leads
      WHERE LOWER(priority) = 'high'
      ORDER BY updated_at DESC
      LIMIT 15
    `).catch(() => [[]]);

    const [highPriorityBuyers] = await db.execute(`
      SELECT id, name, phone, email, COALESCE(buyer_lead_priority, priority) AS priority, buyer_lead_stage AS stage, assigned_executive, 'buyer' AS entity_type
      FROM buyers
      WHERE LOWER(priority) = 'high' OR LOWER(buyer_lead_priority) = 'high'
      ORDER BY updated_at DESC
      LIMIT 15
    `).catch(() => [[]]);

    // Overdue Followups for Escalation Card
    const [overdueLeadFollowups] = await db.execute(`
      SELECT f.id, f.lead_id, l.name AS lead_name, l.priority, u.first_name AS exec_name, f.scheduled_date
      FROM followups f
      JOIN client_leads l ON f.lead_id = l.id
      LEFT JOIN users u ON l.assigned_executive = u.id
      WHERE f.completed_date IS NULL AND f.scheduled_date < NOW()
      ORDER BY f.scheduled_date ASC
      LIMIT 10
    `).catch(() => [[]]);

    res.send({
      success: true,
      data: {
        highPriorityEntities: [...highPriorityLeads, ...highPriorityBuyers],
        overdueFollowups: overdueLeadFollowups,
      }
    });
  } catch (err) {
    res.status(500).send({
      success: false,
      message: err.message || 'Error fetching admin escalations.'
    });
  }
};