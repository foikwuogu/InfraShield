const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const TARDY_EXCUSE_THRESHOLD_MINUTES = 10;

// Report a bus delay. If the delay exceeds the threshold, every student
// who boarded that bus today and hasn't been marked otherwise is
// automatically moved from a tardy risk to EXCUSED_TRANSPORT_DELAY,
// with a fully auditable override record. This is the core InfraShield
// "Attendance Assurance Engine" behavior described in the project brief.
router.post('/', requireAuth, requireRole('driver', 'school_admin', 'district_admin'), async (req, res) => {
  const { bus_id, route_id, driver_id, delay_reason, delay_minutes } = req.body;
  if (!bus_id || !route_id || !Number.isFinite(Number(delay_minutes)) || Number(delay_minutes) < 1) {
    return res.status(400).json({ error: 'bus_id, route_id, and a positive delay_minutes value are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignmentRes = await client.query(
      `SELECT da.driver_id, r.school_id, r.district_id
       FROM driver_assignments da JOIN routes r ON r.route_id = da.route_id
       WHERE da.bus_id = $1 AND da.route_id = $2 AND da.assignment_date = CURRENT_DATE
         AND ($3::varchar <> 'driver' OR da.driver_id = $4)
         AND ($3::varchar <> 'school_admin' OR r.school_id = $5)
         AND ($3::varchar <> 'district_admin' OR r.district_id = $6)
       LIMIT 1`,
      [bus_id, route_id || null, req.user.role, req.user.driver_id || null, req.user.school_id || null, req.user.district_id || null]
    );
    if (!assignmentRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bus route is outside your active assignment or access scope' });
    }
    const assignedDriverId = assignmentRes.rows[0].driver_id;

    const delayId = newId('DLY');
    const delayRes = await client.query(
      `INSERT INTO bus_delays (delay_id, bus_id, route_id, driver_id, delay_reason, delay_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [delayId, bus_id, route_id || null, assignedDriverId || driver_id || null, delay_reason || 'Unspecified', Number(delay_minutes)]
    );

    let overriddenStudents = [];

    if (delay_minutes > TARDY_EXCUSE_THRESHOLD_MINUTES) {
      const affectedEvents = await client.query(
        `SELECT ae.*, s.first_name, s.last_name, s.parent_id
         FROM attendance_events ae
         JOIN students s ON s.student_id = ae.student_id
         WHERE ae.bus_id = $1
           AND DATE(ae.board_time) = CURRENT_DATE
           AND ae.attendance_status = 'PRESENT_TRANSPORTED'
           AND (ae.trip_direction = 'MORNING' OR (ae.trip_direction IS NULL AND ae.trip_id IS NULL))`,
        [bus_id]
      );

      for (const event of affectedEvents.rows) {
        await client.query(
          `UPDATE attendance_events SET attendance_status = 'EXCUSED_TRANSPORT_DELAY' WHERE event_id = $1`,
          [event.event_id]
        );

        await client.query(
          `INSERT INTO attendance_overrides
             (override_id, student_id, attendance_event_id, original_status, new_status, reason)
           VALUES ($1,$2,$3,'PRESENT_TRANSPORTED','EXCUSED_TRANSPORT_DELAY',$4)`,
          [newId('OVR'), event.student_id, event.event_id, `${delay_reason || 'Transportation delay'} (${delay_minutes} min)`]
        );

        if (event.parent_id) {
          await client.query(
            `INSERT INTO parent_notifications (notification_id, student_id, parent_id, notification_type, message)
             VALUES ($1,$2,$3,'EXCUSED_TARDY',$4)`,
            [
              newId('NTF'),
              event.student_id,
              event.parent_id,
              `Bus ${bus_id.replace('BUS', '')} was delayed ${delay_minutes} minutes (${delay_reason || 'transportation delay'}). ${event.first_name} ${event.last_name}'s arrival has been automatically excused.`,
            ]
          );
        }

        overriddenStudents.push({ student_id: event.student_id, name: `${event.first_name} ${event.last_name}` });
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ delay: delayRes.rows[0], excused_students: overriddenStudents });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to report delay' });
  } finally {
    client.release();
  }
});

router.get('/active', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT bd.*, r.route_name, b.bus_number, d.first_name AS driver_first_name, d.last_name AS driver_last_name
     FROM bus_delays bd
     LEFT JOIN routes r ON r.route_id = bd.route_id
     LEFT JOIN buses b ON b.bus_id = bd.bus_id
     LEFT JOIN drivers d ON d.driver_id = bd.driver_id
     WHERE bd.status = 'ACTIVE'
     ORDER BY bd.reported_time DESC`
  );
  res.json(rows);
});

module.exports = router;
