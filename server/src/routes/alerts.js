const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const alertScopePredicate = `(
  ($1 = 'county_admin' AND (
    ea.district_id IN (SELECT district_id FROM districts WHERE county_id = $7)
    OR ea.school_id IN (SELECT sc.school_id FROM schools sc JOIN districts d ON d.district_id = sc.district_id WHERE d.county_id = $7)
    OR ea.route_id IN (SELECT route_id FROM routes r JOIN districts d ON d.district_id = r.district_id WHERE d.county_id = $7)
    OR ea.bus_id IN (SELECT da.bus_id FROM driver_assignments da JOIN routes r ON r.route_id = da.route_id JOIN districts d ON d.district_id = r.district_id WHERE d.county_id = $7)
  ))
  OR ($1 = 'district_admin' AND (
    ea.district_id = $2 OR ea.school_id IN (SELECT school_id FROM schools WHERE district_id = $2)
    OR ea.route_id IN (SELECT route_id FROM routes WHERE district_id = $2)
    OR ea.bus_id IN (SELECT da.bus_id FROM driver_assignments da JOIN routes r ON r.route_id = da.route_id WHERE r.district_id = $2)
  ))
  OR ($1 = 'school_admin' AND (
    ea.school_id = $3
    OR ea.district_id IN (SELECT district_id FROM schools WHERE school_id = $3)
    OR ea.route_id IN (SELECT route_id FROM routes WHERE school_id = $3)
    OR ea.bus_id IN (SELECT da.bus_id FROM driver_assignments da JOIN routes r ON r.route_id = da.route_id WHERE r.school_id = $3)
  ))
  OR ($1 = 'teacher' AND (
    ea.school_id IN (SELECT school_id FROM teachers WHERE teacher_id = $5)
    OR ea.district_id IN (SELECT d.district_id FROM teachers t JOIN schools sc ON sc.school_id = t.school_id JOIN districts d ON d.district_id = sc.district_id WHERE t.teacher_id = $5)
    OR ea.route_id IN (SELECT DISTINCT sr.route_id FROM teachers t JOIN students s ON s.school_id = t.school_id AND s.grade_level = t.grade_level JOIN student_routes sr ON sr.student_id = s.student_id WHERE t.teacher_id = $5)
    OR ea.bus_id IN (SELECT da.bus_id FROM driver_assignments da JOIN routes r ON r.route_id = da.route_id WHERE r.school_id IN (SELECT school_id FROM teachers WHERE teacher_id = $5))
  ))
  OR ($1 = 'parent' AND (
    ea.school_id IN (SELECT school_id FROM students WHERE parent_id = $4)
    OR ea.district_id IN (SELECT sc.district_id FROM students s JOIN schools sc ON sc.school_id = s.school_id WHERE s.parent_id = $4)
    OR ea.route_id IN (SELECT DISTINCT sr.route_id FROM students s JOIN student_routes sr ON sr.student_id = s.student_id WHERE s.parent_id = $4)
    OR ea.bus_id IN (SELECT DISTINCT bt.bus_id FROM students s JOIN student_routes sr ON sr.student_id = s.student_id JOIN bus_trips bt ON bt.route_id = sr.route_id WHERE s.parent_id = $4)
  ))
  OR ($1 = 'driver' AND (
    ea.bus_id IN (SELECT bus_id FROM driver_assignments WHERE driver_id = $6)
    OR ea.route_id IN (SELECT route_id FROM driver_assignments WHERE driver_id = $6)
  ))
)`;

function alertScopeParams(user) {
  return [user.role, user.district_id || null, user.school_id || null,
    user.parent_id || null, user.teacher_id || null, user.driver_id || null, user.county_id || null];
}

// Broadcast an emergency/informational alert scoped to a district, school,
// route, or bus. School/district admins issue these; every parent and
// staff account within scope sees it on their dashboard.
router.post('/', requireAuth, requireRole('school_admin', 'district_admin', 'county_admin'), async (req, res) => {
  const { scope, district_id, school_id, route_id, bus_id, severity, title, message } = req.body;
  if (!scope || !title || !message) {
    return res.status(400).json({ error: 'scope, title, and message are required' });
  }

  const alertId = newId('ALR');
  const { rows } = await pool.query(
    `INSERT INTO emergency_alerts
       (alert_id, scope, district_id, school_id, route_id, bus_id, severity, title, message, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      alertId,
      scope,
      district_id || null,
      school_id || null,
      route_id || null,
      bus_id || null,
      severity || 'INFO',
      title,
      message,
      req.user.username,
    ]
  );

  res.status(201).json(rows[0]);
});

router.post('/:alertId/resolve', requireAuth, requireRole('school_admin', 'district_admin', 'county_admin'), async (req, res) => {
  const { alertId } = req.params;
  const scope = await pool.query(
    `SELECT ea.alert_id FROM emergency_alerts ea WHERE ea.alert_id = $8 AND ${alertScopePredicate}`,
    [...alertScopeParams(req.user), alertId]
  );
  if (!scope.rows[0]) return res.status(404).json({ error: 'Alert not found in your scope' });
  const { rows } = await pool.query(
    `UPDATE emergency_alerts SET status = 'RESOLVED', resolved_date = NOW() WHERE alert_id = $1 RETURNING *`,
    [alertId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Alert not found' });
  res.json(rows[0]);
});

// Active alerts visible to the requesting user, based on their scope
// (district admins see their district's alerts, school staff/parents see
// their school's, drivers see alerts on their bus/route).
router.get('/active', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ea.* FROM emergency_alerts ea
     WHERE ea.status = 'ACTIVE' AND ${alertScopePredicate}
     ORDER BY ea.created_date DESC`,
    alertScopeParams(req.user)
  );
  res.json(rows);
});

module.exports = router;
