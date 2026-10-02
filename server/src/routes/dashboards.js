const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Driver dashboard: today's assignment + student roster with boarding status
router.get('/driver/:driverId', requireAuth, async (req, res) => {
  const { driverId } = req.params;
  if (req.user.role !== 'driver' || req.user.driver_id !== driverId) {
    return res.status(403).json({ error: 'Driver dashboards are limited to your own assignment' });
  }

  const assignmentRes = await pool.query(
    `SELECT da.*, b.bus_number, r.route_name, bt.trip_id, bt.direction, bt.status AS trip_status
     FROM driver_assignments da
     JOIN buses b ON b.bus_id = da.bus_id
     JOIN routes r ON r.route_id = da.route_id
     JOIN bus_trips bt ON bt.assignment_id = da.assignment_id AND bt.service_date = CURRENT_DATE
     WHERE da.driver_id = $1 AND da.assignment_date = CURRENT_DATE
     ORDER BY CASE WHEN bt.status = 'IN_PROGRESS' THEN 0 WHEN bt.status = 'SCHEDULED' THEN 1 ELSE 2 END,
              da.start_time ASC LIMIT 1`,
    [driverId]
  );
  const assignment = assignmentRes.rows[0];

  if (!assignment) {
    return res.json({ assignment: null, roster: [], summary: { expected: 0, boarded: 0, absent: 0 } });
  }

  const rosterRes = await pool.query(
    `SELECT s.student_id, s.student_number, s.first_name, s.last_name, rs.stop_id, rs.stop_name,
            rs.latitude, rs.longitude, rs.sequence_number,
            tse.trip_event_id, tse.boarded_at AS board_time, tse.dropped_off_at AS drop_off_time,
            tse.status AS attendance_status
     FROM student_routes sr
     JOIN students s ON s.student_id = sr.student_id
     JOIN route_stops rs ON rs.stop_id = sr.stop_id
     LEFT JOIN trip_student_events tse
       ON tse.student_id = s.student_id AND tse.trip_id = $2
     WHERE sr.route_id = $1
     ORDER BY rs.sequence_number ASC`,
    [assignment.route_id, assignment.trip_id]
  );

  const roster = rosterRes.rows;
  const boarded = roster.filter((r) => r.board_time && !r.drop_off_time).length;

  res.json({
    assignment,
    roster,
    summary: {
      expected: roster.length,
      boarded,
      absent: roster.filter((r) => !r.board_time).length,
    },
  });
});

// School / attendance office dashboard
router.get('/school/:schoolId', requireAuth, async (req, res) => {
  const { schoolId } = req.params;
  const schoolAccess = await pool.query(
    `SELECT 1 FROM schools sc
     JOIN districts d ON d.district_id = sc.district_id
     WHERE sc.school_id = $1 AND (
       ($2 = 'school_admin' AND sc.school_id = $3)
       OR ($2 = 'district_admin' AND d.district_id = $4)
       OR ($2 = 'county_admin' AND d.county_id = $5)
     )`,
    [schoolId, req.user.role, req.user.school_id || null, req.user.district_id || null, req.user.county_id || null]
  );
  if (!schoolAccess.rows[0]) return res.status(403).json({ error: 'School dashboard is outside your assigned scope' });

  const totalsRes = await pool.query(
    `SELECT COUNT(*)::int AS expected FROM students WHERE school_id = $1 AND status = 'ACTIVE'`,
    [schoolId]
  );

  const statusRes = await pool.query(
    `SELECT s.student_id, s.first_name, s.last_name,
            morning.status AS attendance_status,
            morning.boarded_at AS board_time, morning.dropped_off_at AS drop_off_time,
            morning.bus_number, morning.direction AS morning_direction,
            afternoon.boarded_at AS afternoon_board_time,
            afternoon.dropped_off_at AS afternoon_drop_off_time,
            class.status AS class_attendance_status
     FROM students s
     LEFT JOIN LATERAL (
       SELECT te.status, te.boarded_at, te.dropped_off_at, bt.direction, b.bus_number
       FROM student_routes sr
       JOIN bus_trips bt ON bt.route_id = sr.route_id AND bt.service_date = CURRENT_DATE AND bt.direction = 'MORNING'
       LEFT JOIN trip_student_events te ON te.trip_id = bt.trip_id AND te.student_id = s.student_id
       LEFT JOIN buses b ON b.bus_id = bt.bus_id
       WHERE sr.student_id = s.student_id
       ORDER BY bt.trip_id LIMIT 1
     ) morning ON TRUE
     LEFT JOIN LATERAL (
       SELECT te.boarded_at, te.dropped_off_at
       FROM student_routes sr
       JOIN bus_trips bt ON bt.route_id = sr.route_id AND bt.service_date = CURRENT_DATE AND bt.direction = 'AFTERNOON'
       LEFT JOIN trip_student_events te ON te.trip_id = bt.trip_id AND te.student_id = s.student_id
       WHERE sr.student_id = s.student_id
       ORDER BY bt.trip_id LIMIT 1
     ) afternoon ON TRUE
     LEFT JOIN class_attendance class ON class.student_id = s.student_id AND class.attendance_date = CURRENT_DATE
     WHERE s.school_id = $1
     ORDER BY s.last_name ASC`,
    [schoolId]
  );

  const rows = statusRes.rows;
  const present = rows.filter((r) => r.drop_off_time || r.attendance_status === 'DROPPED_OFF' || r.attendance_status === 'EXCUSED_TRANSPORT_DELAY').length;
  const inTransit = rows.filter((r) => r.board_time && !r.drop_off_time).length;
  const excused = rows.filter((r) => r.attendance_status === 'EXCUSED_TRANSPORT_DELAY').length;
  const absent = rows.filter((r) => !r.board_time).length;

  res.json({
    summary: {
      expected: totalsRes.rows[0].expected,
      present,
      in_transit: inTransit,
      excused_transport_delay: excused,
      absent,
    },
    students: rows,
  });
});

// Parent dashboard: children + their live status + recent notifications
router.get('/parent/:parentId', requireAuth, async (req, res) => {
  const { parentId } = req.params;
  if (req.user.role !== 'parent' || req.user.parent_id !== parentId) {
    return res.status(403).json({ error: 'Parent dashboards are limited to your own family account' });
  }

  const childrenRes = await pool.query(
    `SELECT s.student_id, s.first_name, s.last_name, s.grade_level, sc.school_name,
            morning.boarded_at AS morning_board_time, morning.dropped_off_at AS morning_drop_off_time,
            morning.bus_number AS morning_bus_number,
            afternoon.trip_id AS afternoon_trip_id,
            afternoon.boarded_at AS afternoon_board_time,
            afternoon.dropped_off_at AS afternoon_drop_off_time,
            afternoon.bus_number AS afternoon_bus_number,
            afternoon.driver_first_name AS afternoon_driver_first_name,
            afternoon.driver_last_name AS afternoon_driver_last_name,
            class.status AS class_attendance_status,
            teacher.teacher_id, teacher.first_name AS teacher_first_name,
            teacher.last_name AS teacher_last_name,
            pg.sms_opt_in
     FROM students s
     JOIN schools sc ON sc.school_id = s.school_id
     JOIN parents_guardians pg ON pg.parent_id = s.parent_id
     LEFT JOIN LATERAL (
       SELECT te.boarded_at, te.dropped_off_at, b.bus_number
       FROM student_routes sr
       JOIN bus_trips bt ON bt.route_id = sr.route_id AND bt.service_date = CURRENT_DATE AND bt.direction = 'MORNING'
       LEFT JOIN trip_student_events te ON te.trip_id = bt.trip_id AND te.student_id = s.student_id
       LEFT JOIN buses b ON b.bus_id = bt.bus_id
       WHERE sr.student_id = s.student_id
       ORDER BY bt.trip_id LIMIT 1
     ) morning ON TRUE
     LEFT JOIN LATERAL (
       SELECT bt.trip_id, te.boarded_at, te.dropped_off_at, b.bus_number,
              d.first_name AS driver_first_name, d.last_name AS driver_last_name
       FROM student_routes sr
       JOIN bus_trips bt ON bt.route_id = sr.route_id AND bt.service_date = CURRENT_DATE AND bt.direction = 'AFTERNOON'
       LEFT JOIN trip_student_events te ON te.trip_id = bt.trip_id AND te.student_id = s.student_id
       LEFT JOIN buses b ON b.bus_id = bt.bus_id
       LEFT JOIN drivers d ON d.driver_id = bt.driver_id
       WHERE sr.student_id = s.student_id
       ORDER BY bt.trip_id LIMIT 1
     ) afternoon ON TRUE
     LEFT JOIN class_attendance class ON class.student_id = s.student_id AND class.attendance_date = CURRENT_DATE
     LEFT JOIN LATERAL (
       SELECT t.teacher_id, t.first_name, t.last_name
       FROM teachers t WHERE t.school_id = s.school_id AND t.grade_level = s.grade_level
       ORDER BY t.teacher_id LIMIT 1
     ) teacher ON TRUE
     WHERE s.parent_id = $1`,
    [parentId]
  );

  const notificationsRes = await pool.query(
    `SELECT * FROM parent_notifications WHERE parent_id = $1 ORDER BY sent_time DESC LIMIT 20`,
    [parentId]
  );

  res.json({
    children: childrenRes.rows,
    notifications: notificationsRes.rows,
    sms_delivery_configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
  });
});

// District command center
router.get('/district/:districtId', requireAuth, async (req, res) => {
  const { districtId } = req.params;
  const districtAccess = await pool.query(
    `SELECT 1 FROM districts d WHERE d.district_id = $1 AND (
       ($2 = 'district_admin' AND d.district_id = $3)
       OR ($2 = 'county_admin' AND d.county_id = $4)
     )`,
    [districtId, req.user.role, req.user.district_id || null, req.user.county_id || null]
  );
  if (!districtAccess.rows[0]) return res.status(403).json({ error: 'District dashboard is outside your assigned scope' });

  const summaryRes = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM schools WHERE district_id = $1) AS schools,
       (SELECT COUNT(DISTINCT da.bus_id)::int
         FROM driver_assignments da JOIN routes r ON r.route_id = da.route_id
         WHERE r.district_id = $1 AND da.assignment_date = CURRENT_DATE) AS buses,
       (SELECT COUNT(DISTINCT da.driver_id)::int
         FROM driver_assignments da
         JOIN routes r ON r.route_id = da.route_id
         JOIN drivers d ON d.driver_id = da.driver_id
         WHERE r.district_id = $1 AND da.assignment_date = CURRENT_DATE AND d.status = 'ACTIVE') AS drivers,
       (SELECT COUNT(DISTINCT ae.student_id)::int
          FROM attendance_events ae
          JOIN students s ON s.student_id = ae.student_id
          JOIN schools sc ON sc.school_id = s.school_id
         WHERE sc.district_id = $1 AND DATE(ae.board_time) = CURRENT_DATE) AS students_transported_today,
       (SELECT COUNT(DISTINCT r.route_id)::int
          FROM bus_delays bd JOIN routes r ON r.route_id = bd.route_id
         WHERE bd.status = 'ACTIVE' AND r.district_id = $1) AS delayed_routes,
       (SELECT COUNT(*)::int
          FROM attendance_overrides ao
          JOIN students s ON s.student_id = ao.student_id
          JOIN schools sc ON sc.school_id = s.school_id
         WHERE sc.district_id = $1 AND DATE(ao.created_date) = CURRENT_DATE) AS attendance_adjustments_today`,
    [districtId]
  );

  const schoolsRes = await pool.query(
    `SELECT sc.school_id, sc.school_name,
            COUNT(DISTINCT s.student_id) FILTER (WHERE s.status = 'ACTIVE')::int AS expected,
            COUNT(DISTINCT s.student_id) FILTER (
              WHERE ae.drop_off_time IS NOT NULL
                 OR ae.attendance_status IN ('PRESENT_TRANSPORTED', 'EXCUSED_TRANSPORT_DELAY')
            )::int AS present,
            COUNT(DISTINCT s.student_id) FILTER (
              WHERE ae.board_time IS NOT NULL AND ae.drop_off_time IS NULL
            )::int AS in_transit
     FROM schools sc
     LEFT JOIN students s ON s.school_id = sc.school_id
     LEFT JOIN attendance_events ae
       ON ae.student_id = s.student_id AND DATE(ae.board_time) = CURRENT_DATE
     WHERE sc.district_id = $1
     GROUP BY sc.school_id, sc.school_name
     ORDER BY sc.school_name`,
    [districtId]
  );

  const activeDelaysRes = await pool.query(
    `SELECT bd.*, r.route_name, b.bus_number, d.first_name AS driver_first_name, d.last_name AS driver_last_name
     FROM bus_delays bd
     JOIN routes r ON r.route_id = bd.route_id
     LEFT JOIN buses b ON b.bus_id = bd.bus_id
     LEFT JOIN drivers d ON d.driver_id = bd.driver_id
     WHERE bd.status = 'ACTIVE' AND r.district_id = $1
     ORDER BY bd.reported_time DESC`
    , [districtId]
  );

  res.json({ summary: summaryRes.rows[0], schools: schoolsRes.rows, active_delays: activeDelaysRes.rows });
});

// Teacher dashboard: their students' transportation-linked attendance for the day.
// Matched by school + grade level (see teachers table) rather than a full
// gradebook/class-roster system, which is out of scope here.
router.get('/teacher/:teacherId', requireAuth, async (req, res) => {
  const { teacherId } = req.params;
  const teacherAccess = await pool.query(
    `SELECT 1 FROM teachers t JOIN schools sc ON sc.school_id = t.school_id
     JOIN districts d ON d.district_id = sc.district_id
     WHERE t.teacher_id = $1 AND (
       ($2 = 'teacher' AND t.teacher_id = $3)
       OR ($2 = 'school_admin' AND sc.school_id = $4)
       OR ($2 = 'district_admin' AND d.district_id = $5)
       OR ($2 = 'county_admin' AND d.county_id = $6)
     )`,
    [teacherId, req.user.role, req.user.teacher_id || null, req.user.school_id || null, req.user.district_id || null, req.user.county_id || null]
  );
  if (!teacherAccess.rows[0]) return res.status(403).json({ error: 'Teacher dashboard is outside your assigned scope' });

  const teacherRes = await pool.query(`SELECT * FROM teachers WHERE teacher_id = $1`, [teacherId]);
  const teacher = teacherRes.rows[0];
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

  const rosterRes = await pool.query(
    `SELECT s.student_id, s.first_name, s.last_name,
            class.status AS class_attendance_status, class.note AS class_attendance_note,
            morning.status AS attendance_status,
            morning.boarded_at AS board_time, morning.dropped_off_at AS drop_off_time
     FROM students s
     LEFT JOIN class_attendance class
       ON class.student_id = s.student_id AND class.attendance_date = CURRENT_DATE
     LEFT JOIN LATERAL (
       SELECT te.status, te.boarded_at, te.dropped_off_at
       FROM student_routes sr
       JOIN bus_trips bt ON bt.route_id = sr.route_id AND bt.service_date = CURRENT_DATE AND bt.direction = 'MORNING'
       LEFT JOIN trip_student_events te ON te.trip_id = bt.trip_id AND te.student_id = s.student_id
       WHERE sr.student_id = s.student_id
       ORDER BY bt.trip_id LIMIT 1
     ) morning ON TRUE
     WHERE s.school_id = $1 AND s.grade_level = $2
     ORDER BY s.last_name ASC`,
    [teacher.school_id, teacher.grade_level]
  );

  const rows = rosterRes.rows;
  res.json({
    teacher,
    summary: {
      total: rows.length,
      present: rows.filter((r) => r.class_attendance_status === 'PRESENT').length,
      on_bus: rows.filter((r) => r.attendance_status === 'BOARDED').length,
      not_yet_boarded: rows.filter((r) => !r.attendance_status).length,
      absent: rows.filter((r) => r.class_attendance_status === 'ABSENT').length,
    },
    students: rows,
  });
});

// County command center: rollup across every district in the county
router.get('/county/:countyId', requireAuth, async (req, res) => {
  const { countyId } = req.params;
  if (req.user.role !== 'county_admin' || req.user.county_id !== countyId) {
    return res.status(403).json({ error: 'County dashboard is limited to your assigned county' });
  }

  const summaryRes = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM districts WHERE county_id = $1) AS districts,
       (SELECT COUNT(*)::int FROM schools sc JOIN districts d ON d.district_id = sc.district_id WHERE d.county_id = $1) AS schools,
       (SELECT COUNT(DISTINCT da.bus_id)::int
          FROM driver_assignments da
          JOIN routes r ON r.route_id = da.route_id
          JOIN districts d ON d.district_id = r.district_id
         WHERE d.county_id = $1 AND da.assignment_date = CURRENT_DATE) AS buses,
       (SELECT COUNT(DISTINCT ae.student_id)::int
          FROM attendance_events ae
          JOIN students s ON s.student_id = ae.student_id
          JOIN schools sc ON sc.school_id = s.school_id
          JOIN districts d ON d.district_id = sc.district_id
         WHERE d.county_id = $1 AND DATE(ae.board_time) = CURRENT_DATE) AS students_transported_today,
       (SELECT COUNT(DISTINCT r.route_id)::int
          FROM bus_delays bd
          JOIN routes r ON r.route_id = bd.route_id
          JOIN districts d ON d.district_id = r.district_id
         WHERE bd.status = 'ACTIVE' AND d.county_id = $1) AS delayed_routes,
       (SELECT COUNT(*)::int FROM emergency_alerts ea
         WHERE ea.status = 'ACTIVE' AND (
           ea.district_id IN (SELECT district_id FROM districts WHERE county_id = $1)
           OR ea.school_id IN (
             SELECT sc.school_id FROM schools sc
             JOIN districts d ON d.district_id = sc.district_id WHERE d.county_id = $1
           )
           OR ea.route_id IN (
             SELECT r.route_id FROM routes r
             JOIN districts d ON d.district_id = r.district_id WHERE d.county_id = $1
           )
         )) AS active_alerts`,
    [countyId]
  );

  const districtBreakdownRes = await pool.query(
    `SELECT d.district_id, d.district_name,
            COUNT(DISTINCT sc.school_id)::int AS schools,
            COUNT(DISTINCT s.student_id)::int AS students
     FROM districts d
     LEFT JOIN schools sc ON sc.district_id = d.district_id
     LEFT JOIN students s ON s.school_id = sc.school_id
     WHERE d.county_id = $1
     GROUP BY d.district_id, d.district_name
     ORDER BY d.district_name`,
    [countyId]
  );

  res.json({ summary: summaryRes.rows[0], districts: districtBreakdownRes.rows });
});

module.exports = router;
