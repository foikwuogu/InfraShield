require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying core schema...');
  await pool.query(schema);

  const schemaExt = fs.readFileSync(path.join(__dirname, 'schema_ext.sql'), 'utf8');
  console.log('Applying extension schema (county/teacher/alerts/scheduling/gps)...');
  await pool.query(schemaExt);

  console.log('Schema applied successfully.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
