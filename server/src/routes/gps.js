const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { queueAndSendSms } = require('../services/sms');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Haversine distance in meters between two lat/lng points.
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const GEOFENCE_RADIUS_METERS = 150;
const AVERAGE_BUS_SPEED_KPH = Number(process.env.BUS_AVERAGE_SPEED_KPH) || 25;

async function notifyParentsAboutEta(trip, latitude, longitude) {
  if (trip.direction !== 'AFTERNOON') return 0;
  let alertsCreated = 0;
  const boardedRes = await pool.query(
    `SELECT te.student_id, s.first_name, s.last_name, s.parent_id,
            pg.phone, pg.sms_opt_in, rs.stop_name, rs.latitude AS stop_latitude, rs.longitude AS stop_longitude
     FROM trip_student_events te
     JOIN students s ON s.student_id = te.student_id
     JOIN parents_guardians pg ON pg.parent_id = s.parent_id
     LEFT JOIN route_stops rs ON rs.stop_id = te.stop_id
     WHERE te.trip_id = $1 AND te.boarded_at IS NOT NULL AND te.dropped_off_at IS NULL`,
    [trip.trip_id]
  );

  for (const student of boardedRes.rows) {
    if (student.stop_latitude == null || student.stop_longitude == null) continue;
    const distance = distanceMeters(latitude, longitude, Number(student.stop_latitude), Number(student.stop_longitude));
    const etaMinutes = Math.max(1, Math.ceil(distance / (AVERAGE_BUS_SPEED_KPH * 1000 / 60)));
    if (etaMinutes > 10) continue;

    const alertRes = await pool.query(
      `INSERT INTO bus_trip_alerts (trip_id, student_id, alert_type)
       VALUES ($1,$2,'BUS_ARRIVAL_10_MIN')
       ON CONFLICT DO NOTHING RETURNING trip_id`,
      [trip.trip_id, student.student_id]
    );
    if (!alertRes.rows[0]) continue;

    const message = `InfraShield: ${student.first_name}'s bus is about ${etaMinutes} minute(s) from ${student.stop_name || 'the drop-off stop'}.`;
    await pool.query(
      `INSERT INTO parent_notifications (notification_id, student_id, parent_id, notification_type, message, delivery_method, delivery_status)
       VALUES ($1,$2,$3,'BUS_ARRIVAL_10_MIN',$4,'IN_APP','SENT')`,
      [newId('NTF'), student.student_id, student.parent_id, message]
    );
    alertsCreated += 1;

    if (student.sms_opt_in) {
      const outboxId = newId('SMS');
      try {
        await queueAndSendSms({
          outboxId,
          tripId: trip.trip_id,
          studentId: student.student_id,
          parentId: student.parent_id,
          phone: student.phone,
          body: message,
        });
      } catch (error) {
        console.error('SMS delivery failed:', error.message);
      }
    }
  }
  return alertsCreated;
}

// Driver app pings the bus's current position periodically. We store the
// ping and geofence it against the route's stops so the dashboard can show
// "approaching stop" without any hardware beyond a phone GPS.
router.post('/ping', requireAuth, requireRole('driver'), async (req, res) => {
  const { bus_id, trip_id: tripId, latitude, longitude } = req.body;
  if (!bus_id || !tripId || latitude == null || longitude == null || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return res.status(400).json({ error: 'bus_id, trip_id, and valid latitude/longitude are required' });
  }

  const tripRes = await pool.query(
    `SELECT bt.*, r.school_id, r.district_id
     FROM bus_trips bt JOIN routes r ON r.route_id = bt.route_id
     WHERE bt.trip_id = $1 AND bt.bus_id = $2 AND bt.service_date = CURRENT_DATE AND bt.driver_id = $3`,
    [tripId, bus_id, req.user.driver_id]
  );
  const trip = tripRes.rows[0];
  if (!trip) return res.status(403).json({ error: 'Active trip is not assigned to this driver' });

  await pool.query(
    `INSERT INTO bus_locations (bus_id, route_id, trip_id, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5)`,
    [bus_id, trip.route_id, tripId, latitude, longitude]
  );
  await pool.query(`UPDATE bus_trips SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, NOW()) WHERE trip_id = $1`, [tripId]);

  let nearestStop = null;
  const stopsRes = await pool.query(
    `SELECT stop_id, stop_name, latitude, longitude, sequence_number FROM route_stops WHERE route_id = $1 ORDER BY sequence_number`,
    [trip.route_id]
  );

  let best = null;
  for (const stop of stopsRes.rows) {
    const dist = distanceMeters(Number(latitude), Number(longitude), Number(stop.latitude), Number(stop.longitude));
    if (!best || dist < best.distance_meters) {
      best = { ...stop, distance_meters: Math.round(dist) };
    }
  }
  if (best) {
    nearestStop = {
      stop_id: best.stop_id,
      stop_name: best.stop_name,
      distance_meters: best.distance_meters,
      within_geofence: best.distance_meters <= GEOFENCE_RADIUS_METERS,
    };
    if (nearestStop.within_geofence) {
      await pool.query(
        `INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at)
         VALUES ($1,$2,NOW()) ON CONFLICT (trip_id, stop_id) DO NOTHING`,
        [tripId, best.stop_id]
      );
    }
  }

  const etaAlertsSent = await notifyParentsAboutEta(trip, Number(latitude), Number(longitude));
  res.status(201).json({ recorded: true, trip_id: tripId, nearest_stop: nearestStop, eta_alerts_sent: etaAlertsSent });
});

// Latest known position + nearest-stop context for a bus (school/parent/district views).
router.get('/bus/:busId/latest', requireAuth, async (req, res) => {
  const { busId } = req.params;
  const { rows } = await pool.query(
    `SELECT bl.* FROM bus_locations bl
     JOIN bus_trips bt ON bt.trip_id = bl.trip_id
     JOIN routes r ON r.route_id = bt.route_id
     WHERE bl.bus_id = $1 AND (
       ($2 = 'driver' AND bt.driver_id = $3)
       OR ($2 = 'parent' AND EXISTS (
         SELECT 1 FROM students s JOIN student_routes sr ON sr.student_id = s.student_id
         WHERE s.parent_id = $4 AND sr.route_id = bt.route_id
       ))
       OR ($2 = 'teacher' AND EXISTS (
         SELECT 1 FROM students s JOIN student_routes sr ON sr.student_id = s.student_id
         JOIN teachers t ON t.school_id = s.school_id AND t.grade_level = s.grade_level
         WHERE t.teacher_id = $5 AND sr.route_id = bt.route_id
       ))
       OR ($2 = 'school_admin' AND r.school_id = $6)
       OR ($2 = 'district_admin' AND r.district_id = $7)
       OR ($2 = 'county_admin' AND r.district_id IN (SELECT district_id FROM districts WHERE county_id = $8))
     )
     ORDER BY bl.recorded_at DESC LIMIT 1`,
    [busId, req.user.role, req.user.driver_id || null, req.user.parent_id || null,
      req.user.teacher_id || null, req.user.school_id || null,
      req.user.district_id || null, req.user.county_id || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No GPS data yet for this bus' });
  res.json(rows[0]);
});

router.get('/student/:studentId/route', requireAuth, async (req, res) => {
  if (!['parent', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Parent or assigned teacher account required' });
  }
  const { studentId } = req.params;
  const direction = req.query.direction === 'MORNING' ? 'MORNING' : 'AFTERNOON';

  const studentRes = await pool.query(
    `SELECT s.student_id, s.first_name, s.last_name, s.parent_id, s.school_id, s.grade_level,
            sr.route_id, sr.stop_id, rs.stop_name AS student_stop_name, rs.latitude AS stop_latitude, rs.longitude AS stop_longitude
     FROM students s
     JOIN student_routes sr ON sr.student_id = s.student_id AND sr.status = 'ACTIVE'
     JOIN route_stops rs ON rs.stop_id = sr.stop_id
     WHERE s.student_id = $1 LIMIT 1`,
    [studentId]
  );
  const student = studentRes.rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (req.user.role === 'parent' && student.parent_id !== req.user.parent_id) {
    return res.status(403).json({ error: 'Student is not linked to this parent account' });
  }
  if (req.user.role === 'teacher') {
    const assigned = await pool.query(
      `SELECT 1 FROM teachers WHERE teacher_id = $1 AND school_id = $2 AND grade_level = $3`,
      [req.user.teacher_id, student.school_id, student.grade_level]
    );
    if (!assigned.rows[0]) return res.status(403).json({ error: 'Student is outside your assigned class' });
  }

  const tripRes = await pool.query(
    `SELECT bt.trip_id, bt.direction, bt.status, bt.started_at, bt.completed_at,
            b.bus_number, d.first_name AS driver_first_name, d.last_name AS driver_last_name,
            te.boarded_at, te.dropped_off_at
     FROM bus_trips bt
     JOIN buses b ON b.bus_id = bt.bus_id
     JOIN drivers d ON d.driver_id = bt.driver_id
     LEFT JOIN trip_student_events te ON te.trip_id = bt.trip_id AND te.student_id = $1
     WHERE bt.route_id = $2 AND bt.service_date = CURRENT_DATE AND bt.direction = $3
     ORDER BY bt.trip_id LIMIT 1`,
    [studentId, student.route_id, direction]
  );
  const trip = tripRes.rows[0];
  if (!trip) return res.json({ available: false, direction, student_stop_name: student.student_stop_name });

  const [locationRes, stopsRes, arrivalsRes] = await Promise.all([
    pool.query(`SELECT latitude, longitude, recorded_at FROM bus_locations WHERE trip_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [trip.trip_id]),
    pool.query(`SELECT stop_id, stop_name, latitude, longitude, sequence_number FROM route_stops WHERE route_id = $1 ORDER BY sequence_number`, [student.route_id]),
    pool.query(
      `SELECT tse.stop_id, tse.arrived_at, rs.stop_name, rs.sequence_number
       FROM trip_stop_events tse JOIN route_stops rs ON rs.stop_id = tse.stop_id
       WHERE tse.trip_id = $1 ORDER BY rs.sequence_number`,
      [trip.trip_id]
    ),
  ]);

  const location = locationRes.rows[0] || null;
  const arrivals = arrivalsRes.rows;
  const lastArrived = arrivals[arrivals.length - 1] || null;
  const nextStop = stopsRes.rows.find((stop) => !arrivals.some((arrival) => arrival.stop_id === stop.stop_id)) || null;
  let etaMinutes = null;
  let distanceMetersToStudentStop = null;
  if (location) {
    distanceMetersToStudentStop = Math.round(distanceMeters(
      Number(location.latitude), Number(location.longitude),
      Number(student.stop_latitude), Number(student.stop_longitude)
    ));
    etaMinutes = Math.max(1, Math.ceil(distanceMetersToStudentStop / (AVERAGE_BUS_SPEED_KPH * 1000 / 60)));
  }

  res.json({
    available: true,
    direction,
    trip_id: trip.trip_id,
    trip_status: trip.status,
    bus_number: trip.bus_number,
    driver_name: `${trip.driver_first_name} ${trip.driver_last_name}`,
    boarded_at: trip.boarded_at,
    dropped_off_at: trip.dropped_off_at,
    student_stop_name: student.student_stop_name,
    location,
    last_arrived_stop: lastArrived ? { stop_id: lastArrived.stop_id, stop_name: lastArrived.stop_name, arrived_at: lastArrived.arrived_at } : null,
    next_stop: nextStop ? { stop_id: nextStop.stop_id, stop_name: nextStop.stop_name, sequence_number: nextStop.sequence_number } : null,
    eta_minutes: etaMinutes,
    distance_meters_to_student_stop: distanceMetersToStudentStop,
    average_speed_kph: AVERAGE_BUS_SPEED_KPH,
  });
});

module.exports = router;
