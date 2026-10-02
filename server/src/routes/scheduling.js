const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Current availability of every driver, for dispatch to see who can cover.
router.get('/availability', requireAuth, requireRole('school_admin', 'district_admin', 'county_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.driver_id, d.first_name, d.last_name, d.status AS employment_status,
            COALESCE(da.status, 'AVAILABLE') AS availability_status, da.reason
     FROM drivers d
     LEFT JOIN driver_availability da ON da.driver_id = d.driver_id
     WHERE EXISTS (
       SELECT 1
       FROM driver_assignments assignment
       JOIN routes r ON r.route_id = assignment.route_id
       WHERE assignment.driver_id = d.driver_id
         AND assignment.assignment_date = CURRENT_DATE
         AND (
           ($1 = 'district_admin' AND r.district_id = $2)
           OR ($1 = 'county_admin' AND r.district_id IN (
             SELECT district_id FROM districts WHERE county_id = $4
           ))
           OR ($1 = 'school_admin' AND r.school_id = $3)
         )
     )
    ORDER BY d.last_name`,
      [req.user.role, req.user.district_id || null, req.user.school_id || null, req.user.county_id || null]
  );
  res.json(rows);
});

// Mark a driver out (sick, no-show, etc.)
router.post('/availability/:driverId', requireAuth, requireRole('school_admin', 'district_admin', 'county_admin'), async (req, res) => {
  const { driverId } = req.params;
  const { status, reason } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO driver_availability (driver_id, status, reason, updated_date)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (driver_id) DO UPDATE SET status = $2, reason = $3, updated_date = NOW()
     RETURNING *`,
    [driverId, status || 'OUT', reason || null]
  );
  res.json(rows[0]);
});

// Assign a substitute driver to today's assignment for a route, marking
// the original driver OUT and the substitute ON_ROUTE. This is the core
// "who covers this bus" dispatch action.
router.post('/substitute', requireAuth, requireRole('school_admin', 'district_admin', 'county_admin'), async (req, res) => {
  const { assignment_id, substitute_driver_id, reason } = req.body;
  if (!assignment_id || !substitute_driver_id) {
    return res.status(400).json({ error: 'assignment_id and substitute_driver_id are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignmentRes = await client.query(`SELECT * FROM driver_assignments WHERE assignment_id = $1`, [assignment_id]);
    const assignment = assignmentRes.rows[0];
    if (!assignment) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const originalDriverId = assignment.driver_id;

    await client.query(`UPDATE driver_assignments SET driver_id = $1 WHERE assignment_id = $2`, [
      substitute_driver_id,
      assignment_id,
    ]);

    await client.query(
      `INSERT INTO substitute_assignments (substitution_id, assignment_id, original_driver_id, substitute_driver_id, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [newId('SUB'), assignment_id, originalDriverId, substitute_driver_id, reason || 'Unspecified']
    );

    await client.query(
      `INSERT INTO driver_availability (driver_id, status, reason, updated_date)
       VALUES ($1,'OUT',$2,NOW())
       ON CONFLICT (driver_id) DO UPDATE SET status = 'OUT', reason = $2, updated_date = NOW()`,
      [originalDriverId, reason || 'Covered by substitute']
    );

    await client.query(
      `INSERT INTO driver_availability (driver_id, status, reason, updated_date)
       VALUES ($1,'ON_ROUTE',$2,NOW())
       ON CONFLICT (driver_id) DO UPDATE SET status = 'ON_ROUTE', reason = $2, updated_date = NOW()`,
      [substitute_driver_id, `Covering assignment ${assignment_id}`]
    );

    await client.query('COMMIT');
    res.status(201).json({ assignment_id, original_driver_id: originalDriverId, substitute_driver_id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to assign substitute' });
  } finally {
    client.release();
  }
});

module.exports = router;
