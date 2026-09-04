// backend/utils/leadScoring.js
const db = require('../config/database');

/**
 * Lead Scoring Utility for Client Leads, Buyers, and Sellers
 * Calculates priority_score (0-100+) and maps to priority ('high', 'medium', 'low')
 */

function calculateLeadScore(lead) {
  let score = 0;

  // 1. Stage / Intent Score
  const stage = String(lead.stage || '').toLowerCase();
  if (stage.includes('negotiation') || stage.includes('booking') || stage.includes('token')) {
    score += 40;
  } else if (stage.includes('visit') || stage.includes('shortlist')) {
    score += 35;
  } else if (stage.includes('requirement') || stage.includes('interested')) {
    score += 25;
  } else {
    score += 10;
  }

  // 2. Source Score
  const source = String(lead.lead_source || lead.source || '').toLowerCase();
  if (source.includes('referral') || source.includes('website') || source.includes('inbound')) {
    score += 20;
  } else if (source.includes('portal') || source.includes('magicbricks') || source.includes('99acres') || source.includes('housing')) {
    score += 15;
  } else if (source.includes('social') || source.includes('facebook') || source.includes('instagram')) {
    score += 10;
  } else {
    score += 5;
  }

  // 3. Status Score
  const status = String(lead.status || '').toLowerCase();
  if (status.includes('hot')) {
    score += 20;
  } else if (status.includes('warm')) {
    score += 10;
  }

  // 4. Missed Followup Penalty
  const missedCount = Number(lead.missed_followup_count || 0);
  score -= missedCount * 15;

  if (score < 0) score = 0;

  // Determine Priority Bucket
  let priority = 'low';
  if (score >= 70) {
    priority = 'high';
  } else if (score >= 40) {
    priority = 'medium';
  }

  return { score, priority };
}

function calculateBuyerScore(buyer) {
  let score = 0;

  // 1. Stage Intent
  const stage = String(buyer.buyer_lead_stage || buyer.stage || '').toLowerCase();
  if (stage.includes('negotiation') || stage.includes('booking') || stage.includes('token')) {
    score += 40;
  } else if (stage.includes('visit') || stage.includes('shortlist')) {
    score += 35;
  } else if (stage.includes('requirement') || stage.includes('interested')) {
    score += 25;
  } else {
    score += 10;
  }

  // 2. Budget Score
  const maxBudget = Number(buyer.budget_max || 0);
  if (maxBudget >= 10000000) { // >= 1 Crore
    score += 35;
  } else if (maxBudget >= 5000000) { // >= 50 Lakhs
    score += 20;
  } else if (maxBudget > 0) {
    score += 10;
  }

  // 3. Missed Followup Penalty
  const missedCount = Number(buyer.consecutive_missed_count || buyer.missed_followup_count || 0);
  score -= missedCount * 15;

  if (score < 0) score = 0;

  let priority = 'low';
  if (score >= 70) {
    priority = 'high';
  } else if (score >= 40) {
    priority = 'medium';
  }

  return { score, priority };
}

function calculateSellerScore(seller) {
  let score = 0;

  // 1. Stage / Deal Potential
  const stage = String(seller.stage || seller.current_stage || '').toLowerCase();
  if (stage.includes('mandate') || stage.includes('exclusive') || stage.includes('agreement')) {
    score += 40;
  } else if (stage.includes('valuation') || stage.includes('inspection')) {
    score += 30;
  } else if (stage.includes('listing')) {
    score += 20;
  } else {
    score += 10;
  }

  // 2. Deal Value
  const dealValue = Number(seller.deal_value || 0);
  if (dealValue >= 15000000) { // >= 1.5 Cr
    score += 30;
  } else if (dealValue >= 7500000) { // >= 75 Lakhs
    score += 20;
  } else if (dealValue > 0) {
    score += 10;
  }

  // 3. Missed Followup Penalty
  const missedCount = Number(seller.missed_followup_count || 0);
  score -= missedCount * 15;

  if (score < 0) score = 0;

  let priority = 'low';
  if (score >= 70) {
    priority = 'high';
  } else if (score >= 40) {
    priority = 'medium';
  }

  return { score, priority };
}

/**
 * Updates priority & score in Database safely if columns exist
 */
async function updateEntityPriorityScore(entityType, entityId) {
  try {
    if (!entityId) return;

    if (entityType === 'lead') {
      const [rows] = await db.execute('SELECT * FROM client_leads WHERE id = ?', [entityId]);
      if (rows.length > 0) {
        const { score, priority } = calculateLeadScore(rows[0]);
        await db.execute(
          'UPDATE client_leads SET priority = ?, priority_score = ?, last_score_calculated_at = NOW() WHERE id = ?',
          [priority, score, entityId]
        ).catch(() => {
          // Fallback if priority_score column not created yet
          return db.execute('UPDATE client_leads SET priority = ? WHERE id = ?', [priority, entityId]);
        });
      }
    } else if (entityType === 'buyer') {
      const [rows] = await db.execute('SELECT * FROM buyers WHERE id = ?', [entityId]);
      if (rows.length > 0) {
        const { score, priority } = calculateBuyerScore(rows[0]);
        await db.execute(
          'UPDATE buyers SET priority = ?, priority_score = ?, last_score_calculated_at = NOW() WHERE id = ?',
          [priority, score, entityId]
        ).catch(() => {
          return db.execute('UPDATE buyers SET priority = ? WHERE id = ?', [priority, entityId]);
        });
      }
    } else if (entityType === 'seller') {
      const [rows] = await db.execute('SELECT * FROM sellers WHERE id = ?', [entityId]);
      if (rows.length > 0) {
        const { score, priority } = calculateSellerScore(rows[0]);
        await db.execute(
          'UPDATE sellers SET priority = ?, priority_score = ?, last_score_calculated_at = NOW() WHERE id = ?',
          [priority, score, entityId]
        ).catch(() => {
          return db.execute('UPDATE sellers SET priority = ? WHERE id = ?', [priority, entityId]);
        });
      }
    }
  } catch (err) {
    console.error(`❌ Error calculating priority score for ${entityType} ${entityId}:`, err.message);
  }
}

module.exports = {
  calculateLeadScore,
  calculateBuyerScore,
  calculateSellerScore,
  updateEntityPriorityScore,
};
