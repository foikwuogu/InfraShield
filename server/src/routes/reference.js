const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/students', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT student_id, student_number, first_name, last_name, grade_level, school_id FROM students ORDER BY last_name`
  );
  res.json(rows);
});

router.get('/buses', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM buses ORDER BY bus_number`);
  res.json(rows);
});

router.get('/drivers', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT driver_id, first_name, last_name, employee_number, status FROM drivers ORDER BY last_name`);
  res.json(rows);
});

router.get('/routes', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM routes ORDER BY route_name`);
  res.json(rows);
});

module.exports = router;
