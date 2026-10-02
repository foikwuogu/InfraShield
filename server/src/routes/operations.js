const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const OPERATOR_ROLES = ['school_admin', 'district_admin', 'county_admin'];
const STALE_GPS_MINUTES = 5;
const LATE_DEPARTURE_MINUTES = 15;

function scopePredicate() {
  return `(
    ($1 = 'school_admin' AND r.school_id = $2)
    OR ($1 = 'district_admin' AND r.district_id = $3)
    OR ($1 = 'county_admin' AND r.district_id IN (
      SELECT district_id FROM districts WHERE county_id = $4
    ))
  )`;
}

function scopeParams(user) {
  return [user.role, user.school_id || null, user.district_id || null, user.county_id || null];
}

function insight({ id, severity, category, title, message, recommendation, route, evidence }) {
  return {
    id,
    severity,
    category,
    title,
    message,
    recommendation,
    route_id: route.route_id,
    route_name: route.route_name,
    school_name: route.school_name,
    bus_number: route.bus_number,
    evidence,
  };
}

router.get('/insights', requireAuth, requireRole(...OPERATOR_ROLES), async (req, res, next) => {
  try {
    const routes = await pool.query(
      `SELECT bt.trip_id, bt.direction, bt.status AS trip_status, bt.started_at,
              r.route_id, r.route_name, sc.school_name, b.bus_number,
              d.first_name AS driver_first_name, d.last_name AS driver_last_name,
              COALESCE(availability.status, 'AVAILABLE') AS driver_availability,
              COALESCE(student_counts.expected, 0)::int AS expected_students,
              COALESCE(student_counts.boarded, 0)::int AS boarded_students,
              location.recorded_at AS gps_recorded_at
       FROM bus_trips bt
       JOIN routes r ON r.route_id = bt.route_id
       JOIN schools sc ON sc.school_id = r.school_id
       JOIN buses b ON b.bus_id = bt.bus_id
       JOIN drivers d ON d.driver_id = bt.driver_id
       LEFT JOIN driver_availability availability ON availability.driver_id = bt.driver_id
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT sr.student_id)::int AS expected,
                COUNT(DISTINCT tse.student_id) FILTER (WHERE tse.boarded_at IS NOT NULL)::int AS boarded
         FROM student_routes sr
         LEFT JOIN trip_student_events tse
           ON tse.student_id = sr.student_id AND tse.trip_id = bt.trip_id
         WHERE sr.route_id = bt.route_id AND sr.status = 'ACTIVE'
       ) student_counts ON TRUE
       LEFT JOIN LATERAL (
         SELECT bl.recorded_at
         FROM bus_locations bl
         WHERE bl.trip_id = bt.trip_id
         ORDER BY bl.recorded_at DESC
         LIMIT 1
       ) location ON TRUE
       WHERE bt.service_date = CURRENT_DATE
         AND bt.status <> 'COMPLETED'
         AND ${scopePredicate()}
       ORDER BY r.route_name, bt.direction`,
      scopeParams(req.user),
    );

    const delays = await pool.query(
      `SELECT bd.delay_id, bd.delay_minutes, bd.delay_reason, bd.reported_time,
              r.route_id, r.route_name, sc.school_name, b.bus_number
       FROM bus_delays bd
       JOIN routes r ON r.route_id = bd.route_id
       JOIN schools sc ON sc.school_id = r.school_id
       LEFT JOIN buses b ON b.bus_id = bd.bus_id
       WHERE bd.status = 'ACTIVE' AND ${scopePredicate()}
       ORDER BY bd.reported_time DESC
       LIMIT 100`,
      scopeParams(req.user),
    );

    const insights = [];
    const now = Date.now();

    for (const route of routes.rows) {
      const routeLabel = `${route.route_name} (${route.direction.toLowerCase()})`;
      if (route.trip_status === 'IN_PROGRESS') {
        const ageMinutes = route.gps_recorded_at
          ? Math.floor((now - new Date(route.gps_recorded_at).getTime()) / 60000)
          : null;
        if (ageMinutes === null || ageMinutes >= STALE_GPS_MINUTES) {
          insights.push(insight({
            id: `gps:${route.trip_id}`,
            severity: ageMinutes === null || ageMinutes >= 10 ? 'CRITICAL' : 'WARNING',
            category: 'GPS_STALE',
            title: 'Live bus location is stale',
            message: `${routeLabel} has ${ageMinutes === null ? 'no GPS updates' : `not sent a GPS update for ${ageMinutes} minutes`}.`,
            recommendation: 'Contact the driver to check the device, location permission, and network connection.',
            route,
            evidence: { trip_id: route.trip_id, gps_age_minutes: ageMinutes },
          }));
        }

        const notBoarded = Math.max(0, route.expected_students - route.boarded_students);
        if (notBoarded > 0) {
          insights.push(insight({
            id: `boarding:${route.trip_id}`,
            severity: 'WARNING',
            category: 'BOARDING_GAP',
            title: 'Students remain unaccounted for',
            message: `${notBoarded} of ${route.expected_students} rostered students have no boarding event on ${routeLabel}.`,
            recommendation: 'Check the trip manifest and contact the school office before marking any student absent.',
            route,
            evidence: { trip_id: route.trip_id, expected_students: route.expected_students, boarded_students: route.boarded_students, not_boarded: notBoarded },
          }));
        }

        if (route.driver_availability === 'OUT' || route.driver_availability === 'OFF_SHIFT') {
          insights.push(insight({
            id: `driver:${route.trip_id}`,
            severity: 'CRITICAL',
            category: 'DRIVER_STATUS',
            title: 'Active trip driver is marked unavailable',
            message: `${route.driver_first_name} ${route.driver_last_name} is ${route.driver_availability} while ${routeLabel} is in progress.`,
            recommendation: 'Confirm who is operating the bus and correct the driver availability record.',
            route,
            evidence: { trip_id: route.trip_id, driver_availability: route.driver_availability },
          }));
        }
      }
    }

    for (const delay of delays.rows) {
      if (Number(delay.delay_minutes) < 10) continue;
      insights.push(insight({
        id: `delay:${delay.delay_id}`,
        severity: Number(delay.delay_minutes) >= 30 ? 'CRITICAL' : 'WARNING',
        category: 'PROLONGED_DELAY',
        title: 'Prolonged route delay',
        message: `${delay.route_name} is reported ${delay.delay_minutes} minutes late (${delay.delay_reason || 'reason not provided'}).`,
        recommendation: 'Review the route impact and send a scoped family/staff update if needed.',
        route: delay,
        evidence: { delay_id: delay.delay_id, delay_minutes: Number(delay.delay_minutes), reported_time: delay.reported_time },
      }));
    }

    const priority = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    insights.sort((a, b) => priority[a.severity] - priority[b.severity] || a.title.localeCompare(b.title));

    res.json({
      generated_at: new Date().toISOString(),
      evaluation: 'rules-v1',
      mode: 'explainable_decision_support',
      thresholds: { stale_gps_minutes: STALE_GPS_MINUTES, prolonged_delay_minutes: 10, critical_delay_minutes: 30 },
      summary: {
        total: insights.length,
        critical: insights.filter((item) => item.severity === 'CRITICAL').length,
        warning: insights.filter((item) => item.severity === 'WARNING').length,
      },
      insights,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;