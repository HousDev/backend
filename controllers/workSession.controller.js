const WorkSession = require("../models/workSession.model");
const ActivityEvent = require("../models/activityEvent.model");
const ActivityCheck = require("../models/activityCheck.model");
const BreakModel = require("../models/break.model");
const SessionHeartbeat = require("../models/sessionHeartbeat.model");
const ActivitySettings = require("../models/activitySettings.model");
const { BreakTypeModel, DEFAULT_BREAK_TYPES } = require("../models/breakType.model");

function generateMathQuestion() {
  const ops = ["+", "-", "×", "/"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1, num2, expectedAnswer;

  if (op === "+") {
    num1 = Math.floor(Math.random() * 30) + 5;
    num2 = Math.floor(Math.random() * 30) + 5;
    expectedAnswer = num1 + num2;
  } else if (op === "-") {
    num1 = Math.floor(Math.random() * 40) + 10;
    num2 = Math.floor(Math.random() * num1) + 1;
    expectedAnswer = num1 - num2;
  } else if (op === "×") {
    num1 = Math.floor(Math.random() * 12) + 2;
    num2 = Math.floor(Math.random() * 10) + 2;
    expectedAnswer = num1 * num2;
  } else {
    // Division with clean integer answer
    num2 = Math.floor(Math.random() * 9) + 2;
    expectedAnswer = Math.floor(Math.random() * 10) + 2;
    num1 = num2 * expectedAnswer;
  }

  return {
    question: `${num1} ${op} ${num2} = ?`,
    expectedAnswer: String(expectedAnswer),
  };
}

const workSessionController = {
  // 1. Start Work Session
  startSession: async (req, res) => {
    try {
      const employeeId = req.userId || req.body.employeeId || 1;

      // Check if session exists
      let existingSession = await WorkSession.findActiveByEmployeeId(employeeId);
      if (existingSession) {
        return res.status(200).json({
          success: true,
          message: "Active session retrieved",
          session: existingSession,
        });
      }

      const sessionId = `SES-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newSession = await WorkSession.create({
        session_id: sessionId,
        employee_id: employeeId,
        started_at: new Date(),
        status: "RUNNING",
        current_state: "ACTIVE",
        last_activity_at: new Date(),
      });

      await ActivityEvent.create({
        session_id: sessionId,
        employee_id: employeeId,
        event_type: "SESSION_STARTED",
        metadata: { label: "Started new session" },
      });

      return res.status(201).json({
        success: true,
        message: "Session created successfully",
        session: newSession,
      });
    } catch (err) {
      console.error("Error starting work session:", err);
      return res.status(500).json({ success: false, message: "Failed to start session", error: err.message });
    }
  },

  // 2. Heartbeat API
  heartbeat: async (req, res) => {
    try {
      const { sessionId, idleSeconds, state, activeDuration, idleDuration, breakDuration } = req.body;
      const employeeId = req.userId || req.body.employeeId || 1;

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }

      let session = await WorkSession.findBySessionId(sessionId);
      if (!session) {
        // Fallback: check if employee has any active session
        session = await WorkSession.findActiveByEmployeeId(employeeId);
      }

      if (!session) {
        // Auto-create or recover session so no worked time is lost
        console.log(`[WorkSession] Auto-recovering session ${sessionId} for employee ${employeeId}`);
        const totalPastSecs = (Number(activeDuration || 0) + Number(idleDuration || 0) + Number(breakDuration || 0));
        const startedAt = new Date(Date.now() - totalPastSecs * 1000);
        try {
          session = await WorkSession.create({
            session_id: sessionId,
            employee_id: employeeId,
            started_at: startedAt,
            status: "RUNNING",
            current_state: state || "ACTIVE",
            last_activity_at: new Date(),
          });
        } catch (createErr) {
          console.warn("[WorkSession] Could not auto-create session in heartbeat:", createErr.message);
        }
      }

      try {
        await SessionHeartbeat.create({
          session_id: session?.session_id || sessionId,
          employee_id: employeeId,
          state: state || session?.current_state || "ACTIVE",
          idle_seconds: idleSeconds || 0,
        });
      } catch (hbErr) {
        // Session heartbeat log is optional
      }

      // Update state and live durations in session table
      await WorkSession.updateHeartbeat(
        session?.session_id || sessionId,
        idleSeconds,
        state || session?.current_state || "ACTIVE",
        { activeDuration, idleDuration, breakDuration }
      );

      return res.status(200).json({
        success: true,
        status: session?.status || "RUNNING",
        currentState: state || session?.current_state || "ACTIVE",
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("Error processing heartbeat:", err);
      return res.status(500).json({ success: false, message: "Heartbeat failed", error: err.message });
    }
  },

  // 3. Log General Activity Event
  logActivity: async (req, res) => {
    try {
      const { sessionId, eventType, metadata } = req.body;
      const employeeId = req.userId || 1;

      if (!sessionId || !eventType) {
        return res.status(400).json({ success: false, message: "sessionId and eventType required" });
      }

      const event = await ActivityEvent.create({
        session_id: sessionId,
        employee_id: employeeId,
        event_type: eventType,
        metadata: metadata || {},
      });

      return res.status(200).json({ success: true, event });
    } catch (err) {
      console.error("Error logging activity event:", err);
      return res.status(500).json({ success: false, message: "Log activity failed", error: err.message });
    }
  },

  // 4. Start Activity Check (Math Challenge)
  startActivityCheck: async (req, res) => {
    try {
      const { sessionId } = req.body;
      const employeeId = req.userId || 1;

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId required" });
      }

      const session = await WorkSession.findBySessionId(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, message: "Session not found" });
      }

      // Check if pending math check exists
      let pendingCheck = await ActivityCheck.findLatestPending(sessionId);
      if (!pendingCheck) {
        const { question, expectedAnswer } = generateMathQuestion();
        pendingCheck = await ActivityCheck.create({
          session_id: sessionId,
          employee_id: employeeId,
          question,
          expected_answer: expectedAnswer,
        });
      }

      await WorkSession.updateState(sessionId, "ACTIVITY_CHECK");

      await ActivityEvent.create({
        session_id: sessionId,
        employee_id: employeeId,
        event_type: "ACTIVITY_CHECK_TRIGGERED",
        metadata: { label: "Activity check verification requested" },
      });

      return res.status(200).json({
        success: true,
        checkId: pendingCheck.id,
        question: pendingCheck.question,
      });
    } catch (err) {
      console.error("Error starting activity check:", err);
      return res.status(500).json({ success: false, message: "Failed to start activity check", error: err.message });
    }
  },

  // 5. Submit Activity Check Answer
  submitActivityCheck: async (req, res) => {
    try {
      const { checkId, answer, responseTime, timeout } = req.body;
      const employeeId = req.userId || 1;

      if (!checkId) {
        return res.status(400).json({ success: false, message: "checkId required" });
      }

      const check = await ActivityCheck.findById(checkId);
      if (!check) {
        return res.status(404).json({ success: false, message: "Activity check not found" });
      }

      const settings = await ActivitySettings.getSettings();
      const maxAttempts = settings.max_attempts || 2;

      if (timeout) {
        await ActivityCheck.updateResult(checkId, "TIMEOUT", check.attempts, responseTime || 60);
        await WorkSession.updateState(check.session_id, "IDLE");

        await ActivityEvent.create({
          session_id: check.session_id,
          employee_id: employeeId,
          event_type: "ACTIVITY_CHECK_TIMEOUT",
          metadata: { label: "Activity check timed out (60s expired)" },
        });

        return res.status(200).json({
          success: false,
          result: "TIMEOUT",
          message: "Verification timed out. State set to IDLE.",
        });
      }

      const isCorrect = String(answer).trim() === String(check.expected_answer).trim();
      const currentAttempts = check.attempts + 1;

      if (isCorrect) {
        await ActivityCheck.updateResult(checkId, "PASSED", currentAttempts, responseTime || 0);
        await WorkSession.updateState(check.session_id, "ACTIVE");

        await ActivityEvent.create({
          session_id: check.session_id,
          employee_id: employeeId,
          event_type: "ACTIVITY_CHECK_PASSED",
          metadata: { label: "Activity verification passed", response_time: responseTime },
        });

        return res.status(200).json({
          success: true,
          result: "PASSED",
          message: "Verification passed! Resuming active state.",
        });
      }

      if (currentAttempts >= maxAttempts) {
        await ActivityCheck.updateResult(checkId, "FAILED", currentAttempts, responseTime || 0);
        await WorkSession.updateState(check.session_id, "IDLE");

        await ActivityEvent.create({
          session_id: check.session_id,
          employee_id: employeeId,
          event_type: "ACTIVITY_CHECK_FAILED",
          metadata: { label: "Activity verification failed - attempts exhausted" },
        });

        return res.status(200).json({
          success: false,
          result: "FAILED",
          attemptsExhausted: true,
          message: "Maximum verification attempts exhausted.",
        });
      }

      // Update attempt count, keep pending
      const query = `UPDATE activity_checks SET attempts = ? WHERE id = ?`;
      const db = require("../config/database");
      await db.query(query, [currentAttempts, checkId]);

      return res.status(200).json({
        success: false,
        result: "INCORRECT",
        attemptsLeft: maxAttempts - currentAttempts,
        message: `Incorrect answer. ${maxAttempts - currentAttempts} attempt(s) remaining.`,
      });
    } catch (err) {
      console.error("Error submitting activity check:", err);
      return res.status(500).json({ success: false, message: "Submit verification failed", error: err.message });
    }
  },

  // 6. Start Smart Break
  startBreak: async (req, res) => {
    try {
      const { sessionId, breakType, customDuration, details } = req.body;
      const employeeId = req.userId || 1;

      if (!sessionId || !breakType) {
        return res.status(400).json({ success: false, message: "sessionId and breakType required" });
      }

      const config = (await BreakTypeModel.findByKey(breakType)) || {
        break_key: breakType,
        name: breakType,
        duration: 15,
        daily_limit: 0,
      };

      // Check daily limit if configured (> 0)
      if (config.daily_limit && Number(config.daily_limit) > 0) {
        const counts = await BreakTypeModel.getEmployeeBreakCountsToday(employeeId);
        const usedCount =
          (counts.get(String(config.break_key || "").toLowerCase()) || 0) +
          (counts.get(String(config.name || "").toLowerCase()) || 0) +
          (counts.get(String(breakType).toLowerCase()) || 0);

        if (usedCount >= Number(config.daily_limit)) {
          return res.status(400).json({
            success: false,
            limitReached: true,
            message: `Daily limit reached for ${config.name || breakType} (Max: ${config.daily_limit} times/day).`,
          });
        }
      }

      const allocatedDuration = Number(customDuration) || Number(config.duration) || 15;
      const breakId = `BRK-${Date.now()}`;

      const breakItem = await BreakModel.create({
        break_id: breakId,
        session_id: sessionId,
        employee_id: employeeId,
        break_type: config.break_key || config.name || breakType,
        allocated_duration: allocatedDuration,
        details: typeof details === "object" ? JSON.stringify(details) : details || "",
      });

      await WorkSession.updateState(sessionId, "BREAK", "ON_BREAK");

      await ActivityEvent.create({
        session_id: sessionId,
        employee_id: employeeId,
        event_type: "BREAK_STARTED",
        metadata: { label: `Started ${config.name || breakType}`, breakType: config.name || breakType },
      });

      return res.status(201).json({
        success: true,
        break: breakItem,
        allocatedDuration,
      });
    } catch (err) {
      console.error("Error starting break:", err);
      return res.status(500).json({ success: false, message: "Failed to start break", error: err.message });
    }
  },

  // 7. End Smart Break
  endBreak: async (req, res) => {
    try {
      const { sessionId, breakId } = req.body;
      const employeeId = req.userId || 1;

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }

      let activeBreak = null;
      if (breakId) {
        const query = `SELECT * FROM breaks WHERE break_id = ? LIMIT 1`;
        const db = require("../config/database");
        const [rows] = await db.query(query, [breakId]);
        if (rows.length) activeBreak = rows[0];
      } else {
        activeBreak = await BreakModel.findActiveBySession(sessionId);
      }

      if (activeBreak) {
        const startTime = new Date(activeBreak.started_at).getTime();
        const endTime = Date.now();
        const actualDurationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
        const allocatedSeconds = (activeBreak.allocated_duration || 15) * 60;

        const isResumedEarly = actualDurationSeconds < allocatedSeconds - 60;
        const status = isResumedEarly ? "RESUMED_EARLY" : "COMPLETED";
        const efficiency = actualDurationSeconds <= allocatedSeconds ? "95%" : "75%";

        await BreakModel.endBreak(activeBreak.break_id, actualDurationSeconds, status, efficiency);

        // Update break_duration in session
        await WorkSession.updateDurations(sessionId, 0, 0, actualDurationSeconds);
      }

      await WorkSession.updateState(sessionId, "ACTIVE", "RUNNING");

      await ActivityEvent.create({
        session_id: sessionId,
        employee_id: employeeId,
        event_type: "BREAK_ENDED",
        metadata: { label: "Ended break & resumed work" },
      });

      return res.status(200).json({
        success: true,
        message: "Break ended successfully. Session state set to ACTIVE.",
      });
    } catch (err) {
      console.error("Error ending break:", err);
      return res.status(500).json({ success: false, message: "Failed to end break", error: err.message });
    }
  },

  // 8. End Work Session
  endSession: async (req, res) => {
    try {
      const { sessionId, activeDuration, idleDuration, breakDuration } = req.body;
      const employeeId = req.userId || 1;

      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }

      // Check for active break and auto close it
      const activeBreak = await BreakModel.findActiveBySession(sessionId);
      if (activeBreak) {
        const startTime = new Date(activeBreak.started_at).getTime();
        const actualSecs = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        await BreakModel.endBreak(activeBreak.break_id, actualSecs, "COMPLETED", "90%");
      }

      await WorkSession.endSession(sessionId, {
        active_duration: activeDuration,
        idle_duration: idleDuration,
        break_duration: breakDuration,
      });

      await ActivityEvent.create({
        session_id: sessionId,
        employee_id: employeeId,
        event_type: "SESSION_ENDED",
        metadata: { label: "Ended work session" },
      });

      return res.status(200).json({
        success: true,
        message: "Work session completed successfully.",
      });
    } catch (err) {
      console.error("Error ending session:", err);
      return res.status(500).json({ success: false, message: "Failed to end session", error: err.message });
    }
  },

  // 9. Get Current Active Session & Context Data
  getCurrentSession: async (req, res) => {
    try {
      const employeeId = req.userId || req.query.employeeId || 1;

      const session = await WorkSession.findActiveByEmployeeId(employeeId);
      const settings = await ActivitySettings.getSettings();

      if (!session) {
        return res.status(200).json({
          success: true,
          hasActiveSession: false,
          session: null,
          settings,
        });
      }

      const activeBreak = await BreakModel.findActiveBySession(session.session_id);
      const recentEvents = await ActivityEvent.findBySessionId(session.session_id, 10);
      const breakHistory = await BreakModel.findHistoryBySession(session.session_id);

      return res.status(200).json({
        success: true,
        hasActiveSession: true,
        session,
        activeBreak,
        recentEvents,
        breakHistory,
        settings,
      });
    } catch (err) {
      console.error("Error fetching current session:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch current session", error: err.message });
    }
  },

  // 10. Get History Logs
  getHistory: async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }

      const events = await ActivityEvent.findBySessionId(sessionId, 50);
      return res.status(200).json({ success: true, events });
    } catch (err) {
      console.error("Error fetching activity history:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch history", error: err.message });
    }
  },

  // 11. Get Break History
  getBreaksHistory: async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId) {
        return res.status(400).json({ success: false, message: "sessionId is required" });
      }

      const breaks = await BreakModel.findHistoryBySession(sessionId);
      return res.status(200).json({ success: true, breaks });
    } catch (err) {
      console.error("Error fetching break history:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch break history", error: err.message });
    }
  },

  getEmployeeBreakHistory: async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : (req.userId || 1);
      const today = new Date().toISOString().split("T")[0];
      const fromDate = req.query.fromDate || req.query.from_date || req.query.date || today;
      const toDate = req.query.toDate || req.query.to_date || req.query.date || fromDate;
      const breaks = await BreakModel.findHistoryByEmployee(employeeId, fromDate, toDate);

      return res.status(200).json({ success: true, breaks, fromDate, toDate });
    } catch (err) {
      console.error("Error fetching employee break history:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch employee break history", error: err.message });
    }
  },

  // 12. Settings Get / Update
  getSettings: async (req, res) => {
    try {
      const settings = await ActivitySettings.getSettings();
      return res.status(200).json({ success: true, settings });
    } catch (err) {
      console.error("Error fetching settings:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch settings", error: err.message });
    }
  },

  updateSettings: async (req, res) => {
    try {
      await ActivitySettings.updateSettings(req.body);
      const settings = await ActivitySettings.getSettings();
      return res.status(200).json({ success: true, message: "Settings updated", settings });
    } catch (err) {
      console.error("Error updating settings:", err);
      return res.status(500).json({ success: false, message: "Failed to update settings", error: err.message });
    }
  },

  // 13. Get Employee Daily Updates (date, target, worked, break, productive, status)
  getEmployeeDailyUpdates: async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : (req.userId || 1);
      const exactDate = req.query.date || req.query.exactDate || "";
      const fromDate = req.query.fromDate || req.query.from_date || "";
      const toDate = req.query.toDate || req.query.to_date || "";
      const db = require("../config/database");

      const todayStr = new Date().toISOString().split("T")[0];
      const selectedStart = exactDate || fromDate || toDate || todayStr;
      const selectedEnd = exactDate || toDate || fromDate || todayStr;

      const formatDateRange = (start, end) => {
        const startDate = new Date(`${start}T00:00:00`);
        const endDate = new Date(`${end}T00:00:00`);
        const list = [];
        const cursor = new Date(startDate);

        while (cursor <= endDate) {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, "0");
          const d = String(cursor.getDate()).padStart(2, "0");
          list.push(`${y}-${m}-${d}`);
          cursor.setDate(cursor.getDate() + 1);
        }

        return list;
      };

      const selectedRange = formatDateRange(selectedStart, selectedEnd);

      const formatTime = (secs) => {
        const s = Math.max(0, Math.round(Number(secs) || 0));
        const hrs = String(Math.floor(s / 3600)).padStart(2, "0");
        const mins = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${hrs}:${mins}:${sec}`;
      };

      // Query work sessions grouped by date in the selected date range
      let dateMap = new Map();
      try {
        const dateClause = exactDate || fromDate || toDate ? `AND DATE(started_at) >= ? AND DATE(started_at) <= ?` : `AND DATE(started_at) = ?`;
        const dateParams = exactDate || fromDate || toDate ? [employeeId, selectedStart, selectedEnd] : [employeeId, selectedStart];

        const [rows] = await db.query(
            `SELECT DATE(started_at) as session_date,
              MIN(started_at) as first_started_at,
              MAX(ended_at) as last_ended_at,
              SUM(COALESCE(active_duration, 0)) as active_sec,
                  SUM(COALESCE(idle_duration, 0)) as idle_sec,
                  SUM(COALESCE(break_duration, 0)) as break_sec
           FROM work_sessions 
           WHERE employee_id = ? ${dateClause}
           GROUP BY DATE(started_at)
           ORDER BY DATE(started_at) DESC`,
          dateParams
        );

        for (const r of rows) {
          let dStr = "";
          if (r.session_date instanceof Date) {
            const y = r.session_date.getFullYear();
            const m = String(r.session_date.getMonth() + 1).padStart(2, "0");
            const d = String(r.session_date.getDate()).padStart(2, "0");
            dStr = `${y}-${m}-${d}`;
          } else {
            dStr = String(r.session_date).slice(0, 10);
          }
          dateMap.set(dStr, {
            date: dStr,
            started_at: r.first_started_at,
            ended_at: r.last_ended_at,
            active_seconds: Number(r.active_sec || 0),
            idle_seconds: Number(r.idle_sec || 0),
            break_seconds: Number(r.break_sec || 0),
          });
        }
      } catch (wsErr) {
        console.warn("Could not query work_sessions for employee:", wsErr.message);
      }

      // Query custom targets if table exists
      let targetMap = new Map();
      try {
        const targetClause = exactDate || fromDate || toDate ? `AND target_date >= ? AND target_date <= ?` : `AND target_date = ?`;
        const targetParams = exactDate || fromDate || toDate ? [employeeId, selectedStart, selectedEnd] : [employeeId, selectedStart];

        const [tRows] = await db.query(
          `SELECT target_date, target_seconds 
           FROM employee_daily_targets 
           WHERE employee_id = ? ${targetClause}`,
          targetParams
        );
        for (const tr of tRows) {
          const tdStr = new Date(tr.target_date).toISOString().split("T")[0];
          targetMap.set(tdStr, Number(tr.target_seconds || 28800));
        }
      } catch (tErr) {
        console.warn("Could not query employee_daily_targets:", tErr.message);
      }

      for (const day of selectedRange) {
        if (!dateMap.has(day)) {
          dateMap.set(day, {
            date: day,
            started_at: null,
            ended_at: null,
            active_seconds: 0,
            idle_seconds: 0,
            break_seconds: 0,
          });
        }
      }

      const updates = Array.from(dateMap.values()).sort((a, b) => (a.date > b.date ? 1 : -1)).map((row) => {
        const targetSec = targetMap.get(row.date) || 28800;
        const workedSec = row.active_seconds + row.idle_seconds;
        let status = "PENDING";

        if (row.active_seconds >= targetSec) {
          status = "ACHIEVED";
        } else if (row.active_seconds > 0 && row.date === todayStr) {
          status = "IN_PROGRESS";
        } else if (row.date < todayStr) {
          status = "BEHIND";
        } else if (row.date === todayStr && workedSec === 0) {
          status = "PENDING";
        }

        return {
          date: row.date,
          target_seconds: targetSec,
          target: formatTime(targetSec),
          worked_seconds: workedSec,
          worked: formatTime(workedSec),
          break_seconds: row.break_seconds,
          break_time: formatTime(row.break_seconds),
          productive_seconds: row.active_seconds,
          productive: formatTime(row.active_seconds),
          status,
        };
      });

      return res.status(200).json({ success: true, updates });
    } catch (err) {
      console.error("Error fetching employee daily updates:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch daily updates", error: err.message });
    }
  },

  // 14. Get Admin Overview & Employee Daily Updates
  getAdminDailyUpdates: async (req, res) => {
    try {
      const db = require("../config/database");
      const exactDate = req.query.date || "";
      const fromDate = req.query.fromDate || req.query.from_date || "";
      const toDate = req.query.toDate || req.query.to_date || "";
      const todayStr = new Date().toISOString().split("T")[0];
      const useRange = !exactDate && (fromDate || toDate);
      const effectiveStart = exactDate || fromDate || toDate || todayStr;
      const effectiveEnd = exactDate || toDate || fromDate || todayStr;
      const isToday = exactDate === todayStr || (!exactDate && !fromDate && !toDate);

      const formatTime = (secs) => {
        const s = Math.max(0, Math.round(Number(secs) || 0));
        const hrs = String(Math.floor(s / 3600)).padStart(2, "0");
        const mins = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${hrs}:${mins}:${sec}`;
      };

      const getDateSpanCount = () => {
        if (exactDate) return 1;
        if (!fromDate || !toDate) return 1;
        const start = new Date(`${fromDate}T00:00:00`);
        const end = new Date(`${toDate}T00:00:00`);
        const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
        return diffDays;
      };

      const defaultTargetSec = () => 28800 * getDateSpanCount();

      // 1. Fetch all active users
      let users = [];
      try {
        const [userRows] = await db.query(
          `SELECT id, username, first_name, last_name, email, role, department 
           FROM users 
           WHERE is_active = 1 
           ORDER BY id ASC`
        );
        users = userRows;
      } catch (userErr) {
        console.warn("Query users with is_active fallback:", userErr.message);
        const [fallbackUsers] = await db.query(
          `SELECT id, username, first_name, last_name, email, role, department 
           FROM users 
           ORDER BY id ASC`
        );
        users = fallbackUsers;
      }

      // 2. Fetch work sessions for exact date or selected range
      let sessionsMap = new Map();
      let sessionQuery = `
        SELECT id, session_id, employee_id, active_duration, idle_duration, break_duration, status, current_state, started_at, ended_at 
        FROM work_sessions 
        WHERE 1 = 1`;
      const sessionParams = [];

      if (exactDate) {
        sessionQuery += ` AND (DATE(started_at) = ? OR DATE(CONVERT_TZ(started_at, '+00:00', '+05:30')) = ? OR started_at LIKE CONCAT(?, '%'))`;
        sessionParams.push(exactDate, exactDate, exactDate);
      } else if (useRange) {
        sessionQuery += ` AND DATE(started_at) >= ? AND DATE(started_at) <= ?`;
        sessionParams.push(fromDate || effectiveStart, toDate || effectiveEnd);
      }

      try {
        const [sessionRows] = await db.query(sessionQuery + " ORDER BY id ASC", sessionParams);
        for (const s of sessionRows) {
          const empId = Number(s.employee_id);
          if (!sessionsMap.has(empId)) {
            sessionsMap.set(empId, {
              sessions: [],
              totalActive: 0,
              totalIdle: 0,
              totalBreak: 0,
              latestState: s.current_state,
              latestStatus: s.status,
            });
          }
          const agg = sessionsMap.get(empId);
          agg.sessions.push(s);
          agg.totalActive += Number(s.active_duration || 0);
          agg.totalIdle += Number(s.idle_duration || 0);
          agg.totalBreak += Number(s.break_duration || 0);
          agg.latestState = s.current_state;
          agg.latestStatus = s.status;
        }
      } catch (wsErr) {
        console.warn("work_sessions query skipped:", wsErr.message);
      }

      // 3. Fetch custom targets for selected date/range and sum them by employee
      let targetsMap = new Map();
      let targetQuery = `SELECT employee_id, target_seconds, target_hours FROM employee_daily_targets WHERE 1 = 1`;
      const targetParams = [];

      if (exactDate) {
        targetQuery += ` AND target_date = ?`;
        targetParams.push(exactDate);
      } else if (useRange) {
        targetQuery += ` AND target_date >= ? AND target_date <= ?`;
        targetParams.push(fromDate || effectiveStart, toDate || effectiveEnd);
      }

      try {
        const [targetRows] = await db.query(targetQuery, targetParams);
        for (const t of targetRows) {
          const empId = Number(t.employee_id);
          const sec = Number(t.target_seconds || 28800);
          targetsMap.set(empId, (targetsMap.get(empId) || 0) + sec);
        }
      } catch (tErr) {
        console.warn("employee_daily_targets query skipped:", tErr.message);
      }

      // 4. Combine data for all users
      let employeeList = [];
      let totalProductiveSeconds = 0;
      let workingNow = 0;
      let onBreak = 0;
      let notStarted = 0;
      let targetMissed = 0;

      for (const u of users) {
        const empId = Number(u.id);
        const sessionData = sessionsMap.get(empId);
        const activeSec = sessionData ? sessionData.totalActive : 0;
        const idleSec = sessionData ? sessionData.totalIdle : 0;
        const breakSec = sessionData ? sessionData.totalBreak : 0;
        const workedSec = activeSec + idleSec;
        const empTargetSec = targetsMap.get(empId) || defaultTargetSec();

        let currentState = "NOT_STARTED";
        if (sessionData && sessionData.sessions.length > 0) {
          const rawState = (sessionData.latestState || "").toUpperCase();
          const rawStatus = (sessionData.latestStatus || "").toUpperCase();
          if (rawStatus === "COMPLETED" || rawState === "COMPLETED") {
            currentState = "LOGGED_OUT";
          } else if (rawState === "BREAK") {
            currentState = "BREAK";
          } else if (["ACTIVE", "RUNNING", "ACTIVITY_CHECK"].includes(rawState)) {
            currentState = "ACTIVE";
          } else if (rawState === "IDLE") {
            currentState = "IDLE";
          } else {
            currentState = rawState || "LOGGED_OUT";
          }
        }

        let status = "PENDING";
        if (workedSec === 0) {
          status = "NOT_STARTED";
        } else if (activeSec >= empTargetSec) {
          status = "ACHIEVED";
        } else if (currentState === "LOGGED_OUT") {
          status = activeSec >= empTargetSec ? "ACHIEVED" : "BEHIND";
        } else if (isToday) {
          status = "IN_PROGRESS";
        } else {
          status = "BEHIND";
        }

        totalProductiveSeconds += activeSec;
        if (currentState === "ACTIVE" || currentState === "IDLE") {
          workingNow += 1;
        } else if (currentState === "BREAK") {
          onBreak += 1;
        } else if (status === "NOT_STARTED" || workedSec === 0) {
          notStarted += 1;
        }

        if (status === "BEHIND") {
          targetMissed += 1;
        }

        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || `User #${u.id}`;

        employeeList.push({
          employee_id: empId,
          employee_name: fullName,
          email: u.email || "",
          role: u.role || "Agent",
          department: u.department || "General",
          target_seconds: empTargetSec,
          target: formatTime(empTargetSec),
          worked_seconds: workedSec,
          worked: formatTime(workedSec),
          break_seconds: breakSec,
          break_time: formatTime(breakSec),
          productive_seconds: activeSec,
          productive: formatTime(activeSec),
          current_state: currentState,
          status,
        });
      }

      const totalEmployee = employeeList.length;
      const prodHours = Math.floor(totalProductiveSeconds / 3600);
      const prodMins = Math.floor((totalProductiveSeconds % 3600) / 60);
      const totalProductiveHours = `${prodHours}h ${prodMins}m`;

      return res.status(200).json({
        success: true,
        stats: {
          totalEmployee,
          workingNow,
          onBreak,
          notStarted,
          targetMissed,
          totalProductiveHours,
          totalProductiveSeconds,
          filterRange: {
            exactDate,
            fromDate,
            toDate,
          },
        },
        data: employeeList,
      });
    } catch (err) {
      console.error("Error fetching admin daily updates:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch admin overview", error: err.message });
    }
  },

  // 15. Set Employee Daily Target
  setEmployeeTarget: async (req, res) => {
    try {
      const { employeeId, targetDate, targetHours, targetSeconds } = req.body;
      const db = require("../config/database");

      const secs = targetSeconds || Math.round((parseFloat(targetHours) || 8.0) * 3600);
      const hrs = targetHours || (secs / 3600).toFixed(2);
      const dateVal = targetDate || new Date().toISOString().split("T")[0];

      const upsertQuery = `
        INSERT INTO employee_daily_targets (employee_id, target_date, target_seconds, target_hours)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          target_seconds = VALUES(target_seconds),
          target_hours = VALUES(target_hours)
      `;

      await db.query(upsertQuery, [employeeId, dateVal, secs, hrs]);
      return res.status(200).json({ success: true, message: "Target updated successfully" });
    } catch (err) {
      console.error("Error setting target:", err);
      return res.status(500).json({ success: false, message: "Failed to set target", error: err.message });
    }
  },

  // 16. Get Active Break Types with Employee Daily Usage Counts
  getBreakTypes: async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : (req.userId || 1);
      const breakTypes = await BreakTypeModel.getAll(true);
      const counts = await BreakTypeModel.getEmployeeBreakCountsToday(employeeId);

      const mapped = breakTypes.map((b) => {
        const key = String(b.break_key || "").toLowerCase();
        const nameKey = String(b.name || "").toLowerCase();
        const usedToday = (counts.get(key) || 0) + (counts.get(nameKey) || 0);
        const dailyLimit = Number(b.daily_limit || 0);
        const remaining = dailyLimit > 0 ? Math.max(0, dailyLimit - usedToday) : null;
        const isLimitReached = dailyLimit > 0 && usedToday >= dailyLimit;

        return {
          id: b.id,
          break_key: b.break_key,
          label: b.name,
          name: b.name,
          icon: b.icon || "Coffee",
          duration: Number(b.duration || 15),
          productivity: Number(b.productivity || 0),
          daily_limit: dailyLimit,
          used_today: usedToday,
          remaining_today: remaining,
          is_limit_reached: isLimitReached,
          requires_client: Boolean(b.requires_client),
          requires_location: Boolean(b.requires_location),
          requires_notes: Boolean(b.requires_notes),
          is_active: Boolean(b.is_active),
          display_order: Number(b.display_order || 0),
        };
      });

      return res.status(200).json({ success: true, breakTypes: mapped });
    } catch (err) {
      console.error("Error fetching break types:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch break types", error: err.message });
    }
  },

  // 17. Admin: Get All Break Types
  getAdminBreakTypes: async (req, res) => {
    try {
      const breakTypes = await BreakTypeModel.getAll(false);
      return res.status(200).json({ success: true, breakTypes });
    } catch (err) {
      console.error("Error fetching admin break types:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch admin break types", error: err.message });
    }
  },

  // 18. Admin: Create Break Type
  createBreakType: async (req, res) => {
    try {
      const newType = await BreakTypeModel.create(req.body);
      return res.status(201).json({ success: true, message: "Break type created", breakType: newType });
    } catch (err) {
      console.error("Error creating break type:", err);
      return res.status(500).json({ success: false, message: "Failed to create break type", error: err.message });
    }
  },

  // 19. Admin: Update Break Type
  updateBreakType: async (req, res) => {
    try {
      const { id } = req.params;
      const success = await BreakTypeModel.update(id, req.body);
      return res.status(200).json({ success, message: "Break type updated" });
    } catch (err) {
      console.error("Error updating break type:", err);
      return res.status(500).json({ success: false, message: "Failed to update break type", error: err.message });
    }
  },

  // 20. Admin: Delete Break Type
  deleteBreakType: async (req, res) => {
    try {
      const { id } = req.params;
      const success = await BreakTypeModel.delete(id);
      return res.status(200).json({ success, message: "Break type deleted" });
    } catch (err) {
      console.error("Error deleting break type:", err);
      return res.status(500).json({ success: false, message: "Failed to delete break type", error: err.message });
    }
  },
};

module.exports = workSessionController;
