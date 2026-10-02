const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('../server/node_modules/jsonwebtoken');
const dotenv = require('../server/node_modules/dotenv');
const pool = require('../server/src/db/pool');
const { authenticator } = require('../server/node_modules/otplib');

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const apiBase = 'http://127.0.0.1:4000/api';

async function request(endpoint, options = {}) {
  const response = await fetch(`${apiBase}${endpoint}`, options);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function post(endpoint, body) {
  return request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function checkDatabaseAndRoutes() {
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM users WHERE seeded_identity) AS seeded_identities,
       (SELECT COUNT(*)::int FROM users WHERE signup_required) AS activation_required,
      (SELECT COUNT(*)::int FROM users WHERE signup_required AND email_verified) AS pending_but_verified,
       (SELECT COUNT(*)::int FROM students WHERE status='ACTIVE') AS students,
       (SELECT COUNT(*)::int FROM teachers) AS teachers,
       (SELECT COUNT(*)::int FROM drivers) AS drivers,
       (SELECT COUNT(*)::int FROM schools) AS schools,
       (SELECT COUNT(*)::int FROM bus_trips WHERE service_date=CURRENT_DATE AND direction='MORNING') AS morning_trips,
       (SELECT COUNT(*)::int FROM bus_trips WHERE service_date=CURRENT_DATE AND direction='AFTERNOON') AS afternoon_trips`
  );
  const row = counts.rows[0];
  const schoolCounts = await pool.query(
    `SELECT sc.school_id, COUNT(s.student_id)::int AS students
     FROM schools sc LEFT JOIN students s ON s.school_id=sc.school_id AND s.status='ACTIVE'
     GROUP BY sc.school_id ORDER BY sc.school_id`
  );
  const actual = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
  const expected = { users: 719, seeded_identities: 719, students: 650, teachers: 20, drivers: 20, schools: 13, morning_trips: 13, afternoon_trips: 13 };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`Database ${key} expected ${value}, got ${actual[key]}`);
  }
  if (actual.activation_required > actual.seeded_identities || actual.pending_but_verified > 0) {
    throw new Error('Account activation/email-verification state is inconsistent.');
  }
  if (schoolCounts.rows.length !== 13 || schoolCounts.rows.some((school) => Number(school.students) !== 50)) {
    throw new Error('Every seeded school must have exactly 50 active students.');
  }

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'App.jsx'), 'utf8');
  const roleRoutes = [
    "driver: '/driver'", "school_admin: '/school'", "district_admin: '/district'",
    "parent: '/parent'", "teacher: '/teacher'", "county_admin: '/county'",
  ];
  for (const route of roleRoutes) {
    if (!appSource.includes(route)) throw new Error(`Automatic role dashboard route missing: ${route}`);
  }
  console.log(`PASS data: 13 schools × 50 students; 20 teachers; 20 drivers; 13 AM + 13 PM trips; ${actual.activation_required} linked identities still require sign-up.`);
  console.log('PASS routing: all six account roles have automatic role-home dashboard routes.');
}

async function checkBasicApiGuards() {
  const health = await request('/health');
  if (health.status !== 200 || health.body.status !== 'ok') throw new Error('API health endpoint failed.');

  const protectedRequest = await request('/dashboards/district/DIST001');
  if (protectedRequest.status !== 401) throw new Error(`Expected unauthenticated dashboard API to return 401; got ${protectedRequest.status}.`);
  const insightsAnonymous = await request('/operations/insights');
  if (insightsAnonymous.status !== 401) throw new Error(`Expected unauthenticated operations insights to return 401; got ${insightsAnonymous.status}.`);
  const parentToken = jwt.sign({ auth_version: 2, email_verified: true, role: 'parent' }, process.env.JWT_SECRET);
  const insightsParent = await request('/operations/insights', { headers: { authorization: `Bearer ${parentToken}` } });
  if (insightsParent.status !== 403) throw new Error(`Expected family accounts to be denied dispatcher insights; got ${insightsParent.status}.`);
  const districtToken = jwt.sign({ auth_version: 2, email_verified: true, role: 'district_admin', district_id: 'DIST001' }, process.env.JWT_SECRET);
  const operationalInsights = await request('/operations/insights', { headers: { authorization: `Bearer ${districtToken}` } });
  if (operationalInsights.status !== 200 || operationalInsights.body.evaluation !== 'rules-v1' || !Array.isArray(operationalInsights.body.insights)) {
    throw new Error(`District operations insights failed: ${JSON.stringify(operationalInsights.body)}`);
  }
  if (operationalInsights.body.insights.some((item) => !item.id || !item.severity || !item.recommendation || !item.route_id)) {
    throw new Error('Operations insights returned an incomplete or unscoped item.');
  }

  const pendingAccount = await pool.query(`SELECT username FROM users WHERE signup_required=TRUE LIMIT 1`);
  if (pendingAccount.rows[0]) {
    const legacyLogin = await post('/auth/login', { login: pendingAccount.rows[0].username, password: 'Parent123!' });
    if (legacyLogin.status !== 403) throw new Error('Legacy shared demo password was not retired.');
  }

  const invalidSignup = await post('/auth/signup', { username: 'bad', email: 'bad@example.invalid', role: 'unknown' });
  if (invalidSignup.status !== 400) throw new Error('Invalid signup role was not rejected.');
  console.log(`PASS API: health, protected-dashboard and operations-insights role guards, ${operationalInsights.body.insights.length} structured district insights, legacy-password rejection, and invalid-role signup rejection.`);
}

async function checkSignupAndAuthentication() {
  if (process.env.NODE_ENV === 'production' || process.env.SMTP_HOST) {
    console.log('SKIP disposable signup/OTP exercise: production or SMTP is configured; no test account/email will be created.');
    return;
  }

  const identityResult = await pool.query(
    `SELECT u.*, pg.email AS guardian_email, s.student_number
     FROM users u JOIN parents_guardians pg ON pg.parent_id=u.parent_id
     JOIN students s ON s.parent_id=pg.parent_id
     WHERE u.role='parent' AND u.signup_required=TRUE
     ORDER BY u.user_id LIMIT 1`
  );
  const original = identityResult.rows[0];
  if (!original) {
    console.log('SKIP disposable signup flow: all seeded parent identities have already been activated.');
    return;
  }

  const username = `check.${crypto.randomBytes(6).toString('hex')}`;
  const loginPost = (body) => post('/auth/login', body);
  let restored = false;
  try {
    const signup = await post('/auth/signup', {
      role: 'parent', username, email: original.guardian_email, student_number: original.student_number,
    });
    if (signup.status !== 201 || !signup.body.development_code || !signup.body.development_temporary_password) {
      throw new Error(`Role-linked signup failed: ${JSON.stringify(signup.body)}`);
    }

    const verified = await post('/auth/verify-email', { login: username, code: signup.body.development_code });
    if (verified.status !== 200) throw new Error(`Email verification failed: ${JSON.stringify(verified.body)}`);

    const challenge = await loginPost({ login: username, password: signup.body.development_temporary_password });
    if (challenge.status !== 202 || !challenge.body.development_code) throw new Error('Email OTP challenge was not issued.');

    const signedIn = await loginPost({ login: username, password: signup.body.development_temporary_password, verification_code: challenge.body.development_code });
    if (signedIn.status !== 200 || !signedIn.body.password_change_required) throw new Error('OTP sign-in did not require the temporary password to be changed.');

    const newPassword = `Check-${crypto.randomBytes(12).toString('hex')}!`;
    const rotated = await post('/auth/change-password', {
      token: signedIn.body.token,
      current_password: signup.body.development_temporary_password,
      new_password: newPassword,
    });
    if (rotated.status !== 200 || rotated.body.user.password_change_required) throw new Error('Forced password rotation failed.');

    const setup = await post('/auth/totp/setup', { token: rotated.body.token });
    if (setup.status !== 200 || !setup.body.secret) throw new Error('Authenticator setup failed.');
    const totp = authenticator.generate(setup.body.secret);
    const enabled = await post('/auth/totp/verify', { token: rotated.body.token, otp: totp });
    if (enabled.status !== 200 || !enabled.body.user.totp_enabled) throw new Error('Authenticator TOTP was not enabled.');
    const totpLogin = await loginPost({ login: username, password: newPassword, otp: authenticator.generate(setup.body.secret) });
    if (totpLogin.status !== 200 || !totpLogin.body.token || totpLogin.body.user.auth_version !== 2) throw new Error('Authenticator-app login failed.');

    const duplicate = await post('/auth/signup', {
      role: 'parent', username: `duplicate.${crypto.randomBytes(6).toString('hex')}`,
      email: original.guardian_email, student_number: original.student_number,
    });
    if (duplicate.status !== 409) throw new Error('Duplicate linked identity claim was not blocked.');
    console.log('PASS signup: linked identity, generated password, email verification, email OTP, forced rotation, encrypted TOTP enrollment/login, duplicate-claim protection.');
  } finally {
    await pool.query(`DELETE FROM email_login_codes WHERE user_id=$1`, [original.user_id]);
    await pool.query(
      `UPDATE users SET username=$2,email=$3,password_hash=$4,email_verified=$5,
         password_change_required=$6,password_expires_at=$7,signup_required=$8,
         totp_secret=$9,totp_enabled=$10
       WHERE user_id=$1`,
      [original.user_id, original.username, original.email, original.password_hash,
        original.email_verified, original.password_change_required, original.password_expires_at,
        original.signup_required, original.totp_secret, original.totp_enabled]
    );
    restored = true;
  }
  if (!restored) throw new Error('Signup smoke-test identity was not restored.');
}

(async () => {
  try {
    await checkDatabaseAndRoutes();
    await checkBasicApiGuards();
    await checkSignupAndAuthentication();
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(`CHECK FAILED: ${error.message}`);
  process.exitCode = 1;
});
