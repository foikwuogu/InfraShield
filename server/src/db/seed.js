require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  console.log('Inserting reference data...');
  await pool.query(seedSql);

  const seedExtSql = fs.readFileSync(path.join(__dirname, 'seed_ext.sql'), 'utf8');
  console.log('Inserting extension reference data (teachers, driver availability)...');
  await pool.query(seedExtSql);

  // These rows are pending role-linked identities claimed through signup.
  const demoUsers = [
    { user_id: 'USR001', username: 'driver.johnson', email: 'mjohnson@midlandisd.org', role: 'driver', driver_id: 'DRV001', parent_id: null, school_id: null, district_id: null, teacher_id: null, county_id: null },
    { user_id: 'USR002', username: 'admin.mhs', email: 'admin.sch001@demo.infrashield.local', role: 'school_admin', driver_id: null, parent_id: null, school_id: 'SCH001', district_id: null, teacher_id: null, county_id: null },
    { user_id: 'USR003', username: 'admin.midlandisd', email: 'admin.dist001@demo.infrashield.local', role: 'district_admin', driver_id: null, parent_id: null, school_id: null, district_id: 'DIST001', teacher_id: null, county_id: null },
    { user_id: 'USR004', username: 'parent.smith', email: 'karen.smith@example.com', role: 'parent', driver_id: null, parent_id: 'PAR001', school_id: null, district_id: null, teacher_id: null, county_id: null },
    { user_id: 'USR005', username: 'teacher.ortiz', email: 'rachel.ortiz@midlandisd.example', role: 'teacher', driver_id: null, parent_id: null, school_id: 'SCH001', district_id: null, teacher_id: 'TCH001', county_id: null },
    { user_id: 'USR006', username: 'admin.midlandcounty', email: 'admin.cnt001@demo.infrashield.local', role: 'county_admin', driver_id: null, parent_id: null, school_id: null, district_id: null, teacher_id: null, county_id: 'CNT001' },
  ];

  const [schools, teachers, assignedDrivers, parents, districts, counties] = await Promise.all([
    pool.query(`SELECT school_id FROM schools ORDER BY school_id`),
    pool.query(`SELECT teacher_id, school_id, email FROM teachers ORDER BY teacher_id`),
    pool.query(`SELECT DISTINCT da.driver_id, d.email FROM driver_assignments da JOIN drivers d ON d.driver_id = da.driver_id ORDER BY da.driver_id`),
    pool.query(`SELECT parent_id, email FROM parents_guardians ORDER BY parent_id`),
    pool.query(`SELECT district_id FROM districts ORDER BY district_id`),
    pool.query(`SELECT county_id FROM counties ORDER BY county_id`),
  ]);

  for (const { school_id } of schools.rows) {
    if (school_id === 'SCH001') continue;
    demoUsers.push({ user_id: `USR${school_id}`, username: `admin.${school_id.toLowerCase()}`, email: `admin.${school_id.toLowerCase()}@demo.infrashield.local`, role: 'school_admin', driver_id: null, parent_id: null, school_id, district_id: null, teacher_id: null, county_id: null });
  }
  for (const teacher of teachers.rows) {
    if (teacher.teacher_id === 'TCH001') continue;
    demoUsers.push({ user_id: `USR${teacher.teacher_id}`, username: `teacher.${teacher.teacher_id.toLowerCase()}`, email: teacher.email, role: 'teacher', driver_id: null, parent_id: null, school_id: teacher.school_id, district_id: null, teacher_id: teacher.teacher_id, county_id: null });
  }
  for (const { driver_id, email } of assignedDrivers.rows) {
    if (driver_id === 'DRV001') continue;
    demoUsers.push({ user_id: `USR${driver_id}`, username: `driver.${driver_id.toLowerCase()}`, email, role: 'driver', driver_id, parent_id: null, school_id: null, district_id: null, teacher_id: null, county_id: null });
  }
  for (const { parent_id, email } of parents.rows) {
    if (parent_id === 'PAR001') continue;
    demoUsers.push({ user_id: `USR${parent_id}`, username: `parent.${parent_id.toLowerCase()}`, email, role: 'parent', driver_id: null, parent_id, school_id: null, district_id: null, teacher_id: null, county_id: null });
  }
  for (const { district_id } of districts.rows) {
    if (district_id === 'DIST001') continue;
    demoUsers.push({ user_id: `USR${district_id}`, username: `admin.${district_id.toLowerCase()}`, email: `admin.${district_id.toLowerCase()}@demo.infrashield.local`, role: 'district_admin', driver_id: null, parent_id: null, school_id: null, district_id, teacher_id: null, county_id: null });
  }
  for (const { county_id } of counties.rows) {
    if (county_id === 'CNT001') continue;
    demoUsers.push({ user_id: `USR${county_id}`, username: `admin.${county_id.toLowerCase()}`, email: `admin.${county_id.toLowerCase()}@demo.infrashield.local`, role: 'county_admin', driver_id: null, parent_id: null, school_id: null, district_id: null, teacher_id: null, county_id });
  }

  const unclaimableSeedPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
  for (const u of demoUsers) {
    await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, role, driver_id, parent_id, school_id, district_id, teacher_id, county_id, email_verified, password_change_required, password_expires_at, signup_required, seeded_identity)
       VALUES ($1,$2,$11,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,FALSE,NULL,TRUE,TRUE)
      ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
      WHERE users.signup_required = TRUE`,
      [u.user_id, u.username, unclaimableSeedPasswordHash, u.role, u.driver_id, u.parent_id, u.school_id, u.district_id, u.teacher_id, u.county_id, u.email || `${u.username}@demo.infrashield.local`]
    );
  }

  const roleCounts = demoUsers.reduce((counts, user) => {
    counts[user.role] = (counts[user.role] || 0) + 1;
    return counts;
  }, {});
  console.log('Seed complete. Sign-up eligible linked identities:');
  console.table(roleCounts);
  console.log('These seeded identities must activate through Create Account; shared demo passwords are no longer valid for sign-in.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
