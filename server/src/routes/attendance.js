const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Record a student boarding a bus (driver app / kiosk calls this).
// This is the entry point for the whole attendance pipeline.
router.post('/board', requireAuth, requireRole('driver', 'school_admin', 'district_admin'), async (req, res) => {
  const { student_id, student_school_id, bus_id, trip_id, verification_method, verification_score } = req.body;
  if (!student_id || !bus_id || !trip_id) {
    return res.status(400).json({ error: 'student_id, bus_id, and trip_id are required' });
  }
  const verificationMethod = verification_method || 'MANUAL';
  if (!['SCHOOL_ID', 'MANUAL'].includes(verificationMethod)) {
    return res.status(400).json({ error: 'This verification method is not configured for this bus' });
  }
  if (verificationMethod === 'SCHOOL_ID' && !student_school_id) {
    return res.status(400).json({ error: 'student_school_id is required for school ID verification' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tripRes = await client.query(
      `SELECT bt.*, da.assignment_date, r.school_id, r.district_id
       FROM bus_trips bt
       JOIN driver_assignments da ON da.assignment_id = bt.assignment_id
       JOIN routes r ON r.route_id = bt.route_id
       WHERE bt.trip_id = $1 AND bt.bus_id = $2 AND bt.service_date = CURRENT_DATE`,
      [trip_id, bus_id]
    );
    const trip = tripRes.rows[0];
    if (!trip || trip.status === 'COMPLETED') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active bus trip not found' });
    }
    if (req.user.role === 'driver' && trip.driver_id !== req.user.driver_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This bus trip is not assigned to your driver account' });
    }
    if (req.user.role === 'school_admin' && trip.school_id !== req.user.school_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This bus trip is outside your school' });
    }
    if (req.user.role === 'district_admin' && trip.district_id !== req.user.district_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This bus trip is outside your district' });
    }

    const studentRouteRes = await client.query(
      `SELECT sr.* FROM student_routes sr
       JOIN students s ON s.student_id = sr.student_id
       WHERE sr.student_id = $1 AND sr.route_id = $2 AND sr.status = 'ACTIVE'
         AND ($3::varchar IS NULL OR UPPER(BTRIM(s.student_number)) = UPPER(BTRIM($3)))
       LIMIT 1`,
      [student_id, trip.route_id, verificationMethod === 'SCHOOL_ID' ? student_school_id : null]
    );
    const studentRoute = studentRouteRes.rows[0];

    if (!studentRoute) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Student is not assigned to this route' });
    }

    const tripEventId = newId('TEV');
    const tripEventRes = await client.query(
      `INSERT INTO trip_student_events
         (trip_event_id, trip_id, student_id, stop_id, boarded_at, verification_method, status)
       VALUES ($1,$2,$3,$4,NOW(),$5,'BOARDED')
       ON CONFLICT (trip_id, student_id) DO NOTHING
       RETURNING *`,
      [tripEventId, trip_id, student_id, studentRoute.stop_id, verificationMethod]
    );
    if (!tripEventRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Student already has a boarding record for this trip' });
    }

    await client.query(`UPDATE bus_trips SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, NOW()) WHERE trip_id = $1`, [trip_id]);

    const eventId = newId('EVT');
    const insertRes = await client.query(
      `INSERT INTO attendance_events
        (event_id, student_id, bus_id, driver_id, route_id, stop_id, board_time, verification_method, verification_score, attendance_status, trip_id, trip_direction)
       VALUES ($1,$2,$3,$4,$5,$6, NOW(), $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        eventId,
        student_id,
        bus_id,
        trip.driver_id,
        trip.route_id,
        studentRoute.stop_id,
        verificationMethod,
        verification_score || null,
        trip.direction === 'MORNING' ? 'PRESENT_TRANSPORTED' : 'BOARDED',
        trip_id,
        trip.direction,
      ]
    );

    const studentRes = await client.query('SELECT * FROM students WHERE student_id = $1', [student_id]);
    const student = studentRes.rows[0];

    if (student && student.parent_id) {
      await client.query(
        `INSERT INTO parent_notifications (notification_id, student_id, parent_id, notification_type, message)
         VALUES ($1,$2,$3,'BOARDED',$4)`,
        [
          newId('NTF'),
          student_id,
          student.parent_id,
          `${student.first_name} ${student.last_name} boarded Bus ${bus_id.replace('BUS', '')} for the ${trip.direction.toLowerCase()} trip.`,
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...insertRes.rows[0], trip_event: tripEventRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to record boarding' });
  } finally {
    client.release();
  }
});

// Record a student exiting the bus (arrival at school or home stop).
router.post('/:eventId/dropoff', requireAuth, requireRole('driver', 'school_admin', 'district_admin'), async (req, res) => {
  const { eventId } = req.params;
  const { rows: tripRows } = await pool.query(
    `UPDATE trip_student_events tse
     SET dropped_off_at = NOW(), status = 'DROPPED_OFF', updated_at = NOW()
     FROM bus_trips bt, driver_assignments da, routes r
     WHERE tse.trip_event_id = $1 AND bt.trip_id = tse.trip_id
       AND da.assignment_id = bt.assignment_id AND r.route_id = bt.route_id
       AND bt.service_date = CURRENT_DATE
       AND ($2::varchar <> 'driver' OR bt.driver_id = $3)
       AND ($2::varchar <> 'school_admin' OR r.school_id = $4)
       AND ($2::varchar <> 'district_admin' OR r.district_id = $5)
     RETURNING tse.*`,
    [eventId, req.user.role, req.user.driver_id || null, req.user.school_id || null, req.user.district_id || null]
  );
  if (tripRows[0]) {
    const { rows } = await pool.query(
      `UPDATE attendance_events SET drop_off_time = NOW()
       WHERE trip_id = $1 AND student_id = $2 RETURNING *`,
      [tripRows[0].trip_id, tripRows[0].student_id]
    );
    return res.json(rows[0] || tripRows[0]);
  }

  const { rows } = await pool.query(
    `UPDATE attendance_events ae SET drop_off_time = NOW()
     FROM routes r
     WHERE ae.event_id = $1 AND ae.route_id = r.route_id
       AND ($2::varchar <> 'driver' OR ae.driver_id = $3)
       AND ($2::varchar <> 'school_admin' OR r.school_id = $4)
       AND ($2::varchar <> 'district_admin' OR r.district_id = $5)
     RETURNING ae.*`,
    [eventId, req.user.role, req.user.driver_id || null, req.user.school_id || null, req.user.district_id || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Attendance event not found' });
  res.json(rows[0]);
});

// A single student's most recent status (for parent app / teacher lookups).
router.get('/students/:studentId/status', requireAuth, async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'parent') {
    const ownership = await pool.query(`SELECT 1 FROM students WHERE student_id = $1 AND parent_id = $2`, [studentId, req.user.parent_id]);
    if (!ownership.rows[0]) return res.status(403).json({ error: 'Student is not linked to this parent account' });
  }
  const { rows } = await pool.query(
    `SELECT ae.*, s.first_name, s.last_name, b.bus_number, d.first_name AS driver_first_name, d.last_name AS driver_last_name
     FROM attendance_events ae
     JOIN students s ON s.student_id = ae.student_id
     LEFT JOIN buses b ON b.bus_id = ae.bus_id
     LEFT JOIN drivers d ON d.driver_id = ae.driver_id
     WHERE ae.student_id = $1
     ORDER BY ae.board_time DESC
     LIMIT 1`,
    [studentId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No attendance events for this student yet' });
  res.json(rows[0]);
});

// End-of-route safety check ("no child left behind"). The driver confirms
// the bus is empty; if any student boarded today on this bus still has no
// drop-off recorded, raise a CRITICAL alert instead of silently closing
// out the route.
router.post('/bus/:busId/end-route', requireAuth, requireRole('driver', 'school_admin', 'district_admin'), async (req, res) => {
  const { busId } = req.params;
  const { trip_id: tripId } = req.body;

  if (tripId) {
    const tripRes = await pool.query(
      `SELECT bt.*, r.school_id, r.district_id FROM bus_trips bt
       JOIN routes r ON r.route_id = bt.route_id
       WHERE bt.trip_id = $1 AND bt.bus_id = $2 AND bt.service_date = CURRENT_DATE`,
      [tripId, busId]
    );
    const trip = tripRes.rows[0];
    if (!trip) return res.status(404).json({ error: 'Bus trip not found' });
    if (req.user.role === 'driver' && trip.driver_id !== req.user.driver_id) return res.status(403).json({ error: 'Trip is not assigned to this driver' });
    if (req.user.role === 'school_admin' && trip.school_id !== req.user.school_id) return res.status(403).json({ error: 'Trip is outside your school' });
    if (req.user.role === 'district_admin' && trip.district_id !== req.user.district_id) return res.status(403).json({ error: 'Trip is outside your district' });

    const remaining = await pool.query(
      `SELECT s.student_id, s.first_name, s.last_name
       FROM trip_student_events te JOIN students s ON s.student_id = te.student_id
       WHERE te.trip_id = $1 AND te.boarded_at IS NOT NULL AND te.dropped_off_at IS NULL`,
      [tripId]
    );
    if (remaining.rows.length) {
      const alertId = newId('ALR');
      await pool.query(
        `INSERT INTO emergency_alerts (alert_id, scope, bus_id, route_id, severity, title, message, created_by)
         VALUES ($1,'BUS',$2,$3,'CRITICAL','Student(s) still aboard at end of route',$4,$5)`,
        [alertId, busId, trip.route_id, `${remaining.rows.length} student(s) still show boarded on this trip.`, req.user.username]
      );
      return res.json({ cleared: false, alert_id: alertId, students_remaining: remaining.rows.map((r) => ({ student_id: r.student_id, name: `${r.first_name} ${r.last_name}` })) });
    }

    await pool.query(`UPDATE bus_trips SET status = 'COMPLETED', completed_at = NOW() WHERE trip_id = $1`, [tripId]);
    return res.json({ cleared: true, students_remaining: [] });
  }

  const stillOnboardRes = await pool.query(
    `SELECT ae.event_id, s.student_id, s.first_name, s.last_name
     FROM attendance_events ae
     JOIN students s ON s.student_id = ae.student_id
     WHERE ae.bus_id = $1 AND DATE(ae.board_time) = CURRENT_DATE AND ae.drop_off_time IS NULL`,
    [busId]
  );

  if (stillOnboardRes.rows.length === 0) {
    return res.json({ cleared: true, students_remaining: [] });
  }

  const alertId = newId('ALR');
  await pool.query(
    `INSERT INTO emergency_alerts (alert_id, scope, bus_id, severity, title, message, created_by)
     VALUES ($1,'BUS',$2,'CRITICAL','Student(s) still aboard at end of route',$3,$4)`,
    [
      alertId,
      busId,
      `${stillOnboardRes.rows.length} student(s) show boarded with no drop-off recorded when the route was closed out.`,
      req.user.username,
    ]
  );

  res.status(200).json({
    cleared: false,
    alert_id: alertId,
    students_remaining: stillOnboardRes.rows.map((r) => ({ student_id: r.student_id, name: `${r.first_name} ${r.last_name}` })),
  });
});

module.exports = router;
