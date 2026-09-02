const db = require('../config/database');

const UserActivityEvent = {
  /**
   * Record a visitor or user activity event
   */
  recordEvent: async ({
    guest_id,
    user_id = null,
    lead_id = null,
    source = 'website',
    session_id,
    event_type,
    event_name,
    page_url,
    property_id = null,
    payload = null,
    ip_address = null,
    user_agent = null,
  }) => {
    if (!guest_id || !session_id || !event_name) {
      return { success: false, message: 'Missing required tracking fields' };
    }

    try {
      const sql = `
        INSERT INTO user_activity_events (
          guest_id, user_id, lead_id, source, session_id,
          event_type, event_name, page_url, property_id,
          payload, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const serializedPayload = payload ? (typeof payload === 'object' ? JSON.stringify(payload) : String(payload)) : null;

      const [result] = await db.query(sql, [
        guest_id,
        user_id || null,
        lead_id || null,
        source || 'website',
        session_id,
        event_type || 'general',
        event_name,
        page_url || '/',
        property_id || null,
        serializedPayload,
        ip_address || null,
        user_agent || null,
      ]);

      return { success: true, insertId: result.insertId };
    } catch (err) {
      console.error('Error recording user activity event:', err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Universal Identity Stitching: Link guest_id to user_id on Login / Signup
   * Preserves guest_id permanently for audit trails
   */
  stitchGuestToUser: async (guestId, userId) => {
    if (!guestId || !userId) return;
    try {
      const sql = `
        UPDATE user_activity_events
        SET user_id = ?
        WHERE guest_id = ? AND user_id IS NULL
      `;
      await db.query(sql, [userId, guestId]);
    } catch (err) {
      console.error('Error stitching guest to user:', err.message);
    }
  },

  /**
   * Universal Identity Stitching: Link guest_id to lead_id on Form Submission / Contact Enquiry
   * Preserves guest_id permanently for audit trails
   */
  stitchGuestToLead: async (guestId, leadIdentifier) => {
    if (!guestId || !leadIdentifier) return;
    try {
      let numericLeadId = null;
      if (!isNaN(Number(leadIdentifier)) && Number(leadIdentifier) > 0) {
        numericLeadId = Number(leadIdentifier);
      } else {
        const [rows] = await db.query('SELECT lead_number FROM client_leads WHERE id = ? LIMIT 1', [leadIdentifier]);
        if (rows.length && rows[0].lead_number) {
          numericLeadId = rows[0].lead_number;
        }
      }

      if (numericLeadId) {
        const sql = `
          UPDATE user_activity_events
          SET lead_id = ?
          WHERE guest_id = ? AND (lead_id IS NULL OR lead_id = 0)
        `;
        await db.query(sql, [numericLeadId, guestId]);
      }
    } catch (err) {
      console.error('Error stitching guest to lead:', err.message);
    }
  },

  /**
   * Retrieve full 360 chronological timeline for a Lead
   */
  getTimelineByLead: async (leadIdentifier) => {
    try {
      const [leads] = await db.query(
        'SELECT id, phone, email, name, lead_number FROM client_leads WHERE id = ? OR lead_number = ? LIMIT 1',
        [leadIdentifier, isNaN(Number(leadIdentifier)) ? 0 : Number(leadIdentifier)]
      );
      const lead = leads && leads[0];
      const leadNum = lead ? lead.lead_number : (!isNaN(Number(leadIdentifier)) ? Number(leadIdentifier) : null);

      if (!lead && !leadNum) return [];

      let sql = `
        SELECT 
          e.*,
          COALESCE(p.society_name, CONCAT('Property #', e.property_id)) AS property_title,
          COALESCE(p.final_price, p.budget) AS property_price,
          p.location_name AS property_locality,
          p.city_name AS property_city
        FROM user_activity_events e
        LEFT JOIN my_properties p ON e.property_id = p.id
        WHERE e.lead_id = ?
           OR (e.guest_id IS NOT NULL AND e.guest_id IN (
                SELECT DISTINCT inner_e.guest_id 
                FROM user_activity_events inner_e 
                WHERE inner_e.lead_id = ?
              ))
      `;
      const params = [leadNum, leadNum];

      if (lead && lead.phone) {
        sql += ` OR JSON_UNQUOTE(JSON_EXTRACT(e.payload, '$.phone')) = ? `;
        params.push(lead.phone);
      }
      if (lead && lead.email) {
        sql += ` OR JSON_UNQUOTE(JSON_EXTRACT(e.payload, '$.email')) = ? `;
        params.push(lead.email);
      }

      sql += ` ORDER BY e.created_at ASC LIMIT 500`;

      const [events] = await db.query(sql, params);

      // Auto-stitch guest_id if we found events for this lead
      if (events && events.length > 0 && leadNum) {
        const guestIds = [...new Set(events.map(ev => ev.guest_id).filter(Boolean))];
        for (const gId of guestIds) {
          await db.query('UPDATE user_activity_events SET lead_id = ? WHERE guest_id = ? AND (lead_id IS NULL OR lead_id = 0)', [leadNum, gId]).catch(() => {});
        }
      }

      return events || [];
    } catch (err) {
      console.error('Error fetching lead timeline:', err.message);
      return [];
    }
  },

  /**
   * Retrieve full chronological timeline for a User
   */
  getTimelineByUser: async (userId) => {
    try {
      const sql = `
        SELECT 
          e.*,
          COALESCE(p.society_name, CONCAT('Property #', e.property_id)) AS property_title,
          COALESCE(p.final_price, p.budget) AS property_price,
          p.location_name AS property_locality,
          p.city_name AS property_city
        FROM user_activity_events e
        LEFT JOIN my_properties p ON e.property_id = p.id
        WHERE e.user_id = ? 
           OR (e.guest_id IS NOT NULL AND e.guest_id IN (
                SELECT DISTINCT inner_e.guest_id 
                FROM user_activity_events inner_e 
                WHERE inner_e.user_id = ?
              ))
        ORDER BY e.created_at ASC
        LIMIT 500
      `;

      const [events] = await db.query(sql, [userId, userId]);
      return events || [];
    } catch (err) {
      console.error('Error fetching user timeline:', err.message);
      return [];
    }
  },

  /**
   * Retrieve timeline by Guest UUID (for anonymous visitors)
   */
  getTimelineByGuest: async (guestId) => {
    try {
      const sql = `
        SELECT 
          e.*,
          COALESCE(p.society_name, CONCAT('Property #', e.property_id)) AS property_title,
          COALESCE(p.final_price, p.budget) AS property_price,
          p.location_name AS property_locality,
          p.city_name AS property_city
        FROM user_activity_events e
        LEFT JOIN my_properties p ON e.property_id = p.id
        WHERE e.guest_id = ?
        ORDER BY e.created_at ASC
        LIMIT 300
      `;
      const [events] = await db.query(sql, [guestId]);
      return events || [];
    } catch (err) {
      console.error('Error fetching guest timeline:', err.message);
      return [];
    }
  },

  /**
   * Retrieve timeline for a specific Session ID
   */
  getTimelineBySession: async (sessionId) => {
    try {
      const sql = `
        SELECT 
          e.*,
          COALESCE(p.society_name, CONCAT('Property #', e.property_id)) AS property_title,
          COALESCE(p.final_price, p.budget) AS property_price,
          p.location_name AS property_locality,
          p.city_name AS property_city
        FROM user_activity_events e
        LEFT JOIN my_properties p ON e.property_id = p.id
        WHERE e.session_id = ?
        ORDER BY e.created_at ASC
        LIMIT 500
      `;
      const [events] = await db.query(sql, [sessionId]);
      return events || [];
    } catch (err) {
      console.error('Error fetching session timeline:', err.message);
      return [];
    }
  },

  /**
   * Overview statistics for Anonymous & Identified Visitor Analytics
   */
  getOverviewStats: async ({ dateRange = '30d', startDate, endDate } = {}) => {
    try {
      let dateCondition = '';
      const params = [];

      if (dateRange === '7d') {
        dateCondition = 'created_at >= NOW() - INTERVAL 7 DAY';
      } else if (dateRange === '30d') {
        dateCondition = 'created_at >= NOW() - INTERVAL 30 DAY';
      } else if (startDate && endDate) {
        dateCondition = 'created_at BETWEEN ? AND ?';
        params.push(startDate, endDate);
      }

      // Base admin exclusion
      const adminFilter = `(e.source != 'admin' AND (u.role IS NULL OR LOWER(u.role) != 'admin'))`;
      const eDateCondition = dateCondition ? `AND e.${dateCondition}` : '';

      // 1. Totals Query (Excluding admin)
      const totalsSql = `
        SELECT 
          COUNT(*) AS total_events,
          COUNT(DISTINCT e.guest_id) AS total_visitors,
          COUNT(DISTINCT e.session_id) AS total_sessions,
          COUNT(DISTINCT CASE WHEN e.lead_id IS NOT NULL THEN e.guest_id END) AS converted_lead_visitors,
          COUNT(DISTINCT CASE WHEN e.user_id IS NOT NULL THEN e.guest_id END) AS logged_in_visitors,
          COUNT(CASE WHEN e.event_type = 'calculator' THEN 1 END) AS emi_calculations_count,
          COUNT(CASE WHEN e.event_type = 'search' THEN 1 END) AS searches_count,
          COUNT(CASE WHEN e.event_type = 'property' THEN 1 END) AS property_views_count
        FROM user_activity_events e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE ${adminFilter} ${eDateCondition}
      `;
      const [totals] = await db.query(totalsSql, params);

      // 2. Top Properties Viewed Query (Joined with my_properties table)
      const topPropsSql = `
        SELECT 
          e.property_id,
          COALESCE(ANY_VALUE(p.society_name), CONCAT('Property #', e.property_id)) AS property_title,
          ANY_VALUE(p.location_name) AS locality,
          ANY_VALUE(p.city_name) AS city,
          ANY_VALUE(COALESCE(p.final_price, p.budget)) AS price,
          COUNT(*) AS total_views,
          COUNT(DISTINCT e.guest_id) AS unique_visitors
        FROM user_activity_events e
        LEFT JOIN my_properties p ON e.property_id = p.id
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.property_id IS NOT NULL AND ${adminFilter} ${eDateCondition}
        GROUP BY e.property_id
        ORDER BY total_views DESC
        LIMIT 10
      `;
      const [topProperties] = await db.query(topPropsSql, params);

      // 3. Top Search Queries Query
      const topSearchesSql = `
        SELECT 
          e.event_name,
          ANY_VALUE(e.payload) AS payload,
          COUNT(*) AS count
        FROM user_activity_events e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.event_type = 'search' AND ${adminFilter} ${eDateCondition}
        GROUP BY e.event_name, CAST(e.payload AS CHAR(500))
        ORDER BY count DESC
        LIMIT 10
      `;
      const [topSearches] = await db.query(topSearchesSql, params);

      // 4. Recent Active Visitor Sessions Query (Group first, then join users and client_leads)
      const recentSessionsSql = `
        SELECT 
          s.session_id,
          s.guest_id,
          s.user_id,
          s.lead_id,
          COALESCE(u.role, s.source) AS exact_role,
          NULLIF(TRIM(CONCAT_WS(' ', u.salutation, u.first_name, u.last_name)), '') AS user_full_name,
          u.email AS user_email,
          u.phone AS user_phone,
          u.username AS username,
          l.name AS lead_name,
          l.phone AS lead_phone,
          s.source,
          s.ip_address,
          s.user_agent,
          s.total_events,
          s.session_start,
          s.session_last_active,
          s.duration_seconds,
          s.key_actions
        FROM (
          SELECT 
            e.session_id,
            MAX(e.guest_id) AS guest_id,
            MAX(e.user_id) AS user_id,
            MAX(e.lead_id) AS lead_id,
            COALESCE(
              MAX(CASE WHEN e.source != 'website' THEN e.source ELSE NULL END),
              MAX(e.source),
              'website'
            ) AS source,
            MAX(e.ip_address) AS ip_address,
            MAX(e.user_agent) AS user_agent,
            COUNT(*) AS total_events,
            MIN(e.created_at) AS session_start,
            MAX(e.created_at) AS session_last_active,
            TIMESTAMPDIFF(SECOND, MIN(e.created_at), MAX(e.created_at)) AS duration_seconds,
            GROUP_CONCAT(DISTINCT e.event_name SEPARATOR ', ') AS key_actions
          FROM user_activity_events e
          WHERE e.source != 'admin' ${eDateCondition}
          GROUP BY e.session_id
        ) s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN client_leads l ON (s.lead_id = l.lead_number OR s.lead_id = l.id)
        WHERE (u.role IS NULL OR LOWER(u.role) != 'admin')
        ORDER BY s.session_last_active DESC
        LIMIT 500
      `;
      const [recentSessions] = await db.query(recentSessionsSql, params);

      return {
        summary: totals && totals[0] ? totals[0] : {},
        topProperties: topProperties || [],
        topSearches: topSearches || [],
        recentSessions: recentSessions || [],
      };
    } catch (err) {
      console.error('Error fetching overview stats:', err);
      return { summary: {}, topProperties: [], topSearches: [], recentSessions: [] };
    }
  },
};

module.exports = UserActivityEvent;
