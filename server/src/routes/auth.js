const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { authenticator } = require('otplib');
const pool = require('../db/pool');

const router = express.Router();
const EMAIL_CODE_TTL_MINUTES = 10;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const PASSWORD_TTL_HOURS = 24;

authenticator.options = { step: 30, digits: 6, window: 1 };

function totpEncryptionKey() {
  const configured = process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!configured) throw new Error('JWT_SECRET or TOTP_ENCRYPTION_KEY must be configured');
  return crypto.scryptSync(configured, 'InfraShield:TOTP:secret:v1', 32);
}

function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', totpEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('base64')}`;
}

function decryptTotpSecret(value) {
  const [version, ivHex, tagHex, encryptedBase64] = String(value || '').split(':');
  if (version !== 'v1' || !ivHex || !tagHex || !encryptedBase64) throw new Error('Stored authenticator secret has an unsupported format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', totpEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedBase64, 'base64')), decipher.final()]).toString('utf8');
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function generateOneTimePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(24);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function authUser(user) {
  return {
    auth_version: 2,
    user_id: user.user_id,
    username: user.username,
    email: user.email,
    email_verified: user.email_verified,
    role: user.role,
    driver_id: user.driver_id,
    parent_id: user.parent_id,
    school_id: user.school_id,
    district_id: user.district_id,
    teacher_id: user.teacher_id,
    county_id: user.county_id,
    password_change_required: user.password_change_required,
    totp_enabled: user.totp_enabled,
  };
}

function signToken(user) {
  const payload = authUser(user);
  return {
    token: jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }),
    user: payload,
  };
}

function getMailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

async function sendMail(email, subject, text) {
  const mailer = getMailer();
  if (!mailer) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured');
    console.info(`[DEV EMAIL] ${subject} to ${email}\n${text}`);
    return;
  }
  await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject, text });
}

async function sendGeneratedPassword(email, username, password) {
  await sendMail(
    email,
    'Your InfraShield temporary password',
    `Account: ${username}\nTemporary password: ${password}\n\nThis password expires in ${PASSWORD_TTL_HOURS} hours. Sign in and choose a new password immediately.`,
  );
}

async function issueEmailCode(user, purpose) {
  const recent = await pool.query(
    `SELECT COUNT(*)::int AS count FROM email_login_codes
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
    [user.user_id],
  );
  if (recent.rows[0].count >= 5) {
    const error = new Error('Too many codes requested. Try again in 10 minutes.');
    error.status = 429;
    throw error;
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  await pool.query(
    `INSERT INTO email_login_codes (challenge_id, user_id, code_hash, expires_at)
     VALUES ($1,$2,$3,NOW() + ($4 * INTERVAL '1 minute'))`,
    [newId('EMAIL'), user.user_id, codeHash, EMAIL_CODE_TTL_MINUTES],
  );
  await sendMail(
    user.email,
    purpose === 'VERIFY_EMAIL' ? 'Verify your InfraShield account' : 'Your InfraShield sign-in code',
    `Your one-time code is ${code}. It expires in ${EMAIL_CODE_TTL_MINUTES} minutes. If you did not request it, ignore this message.`,
  );
  return process.env.NODE_ENV === 'production' ? {} : { development_code: code };
}

async function verifyEmailCode(user, code) {
  const challengeRes = await pool.query(
    `SELECT challenge_id, code_hash FROM email_login_codes
     WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > NOW() AND attempts < $2
     ORDER BY created_at DESC LIMIT 1`,
    [user.user_id, EMAIL_CODE_MAX_ATTEMPTS],
  );
  const challenge = challengeRes.rows[0];
  if (!challenge) return false;
  const valid = await bcrypt.compare(String(code), challenge.code_hash);
  if (!valid) {
    await pool.query(`UPDATE email_login_codes SET attempts = attempts + 1 WHERE challenge_id = $1`, [challenge.challenge_id]);
    return false;
  }
  await pool.query(`UPDATE email_login_codes SET consumed_at = NOW() WHERE challenge_id = $1`, [challenge.challenge_id]);
  return true;
}

async function resolveRegistrationIdentity(client, body) {
  const role = body.role;
  const email = normalizeEmail(body.email);
  if (!['parent', 'teacher', 'driver', 'school_admin', 'district_admin', 'county_admin'].includes(role)) {
    return { error: 'Choose a supported account type.' };
  }
  if (!isValidEmail(email)) return { error: 'Enter a valid email address.' };

  if (role === 'parent') {
    const studentNumber = typeof body.student_number === 'string' ? body.student_number.trim().toUpperCase() : '';
    if (!studentNumber) return { error: 'Student school ID is required to link a parent account.' };
    const result = await client.query(
      `SELECT s.parent_id, pg.email AS registered_email FROM students s
       JOIN parents_guardians pg ON pg.parent_id = s.parent_id
       WHERE UPPER(BTRIM(s.student_number)) = $1 LIMIT 1`,
      [studentNumber],
    );
    const identity = result.rows[0];
    if (!identity || normalizeEmail(identity.registered_email) !== email) {
      return { error: 'Student ID and email do not match a guardian record. Contact the school office if your email needs updating.' };
    }
    return { identity: { parent_id: identity.parent_id } };
  }

  if (role === 'teacher') {
    const teacherId = String(body.teacher_id || '').trim().toUpperCase();
    const result = await client.query(
      `SELECT teacher_id, school_id FROM teachers WHERE UPPER(teacher_id) = $1 AND LOWER(email) = $2`,
      [teacherId, email],
    );
    if (!result.rows[0]) return { error: 'Teacher ID and email do not match an existing school staff record.' };
    return { identity: { teacher_id: result.rows[0].teacher_id, school_id: result.rows[0].school_id } };
  }

  if (role === 'driver') {
    const employeeId = String(body.employee_id || '').trim().toUpperCase();
    const result = await client.query(
      `SELECT driver_id FROM drivers WHERE UPPER(employee_number) = $1 AND LOWER(email) = $2`,
      [employeeId, email],
    );
    if (!result.rows[0]) return { error: 'Driver employee ID and email do not match an existing driver record.' };
    return { identity: { driver_id: result.rows[0].driver_id } };
  }

  const invite = String(body.invite_code || '');
  const configuredInvite = String(process.env.ADMIN_SIGNUP_INVITE_CODE || '');
  const orgId = String(body.organization_id || '').trim().toUpperCase();
  if (!configuredInvite || !invite || invite.length !== configuredInvite.length ||
      !crypto.timingSafeEqual(Buffer.from(invite), Buffer.from(configuredInvite))) {
    return { error: 'Administrator accounts require a valid district-issued invitation code.' };
  }
  if (role === 'school_admin') {
    const result = await client.query(`SELECT school_id FROM schools WHERE UPPER(school_id) = $1`, [orgId]);
    return result.rows[0] ? { identity: { school_id: result.rows[0].school_id } } : { error: 'Select a valid school.' };
  }
  if (role === 'district_admin') {
    const result = await client.query(`SELECT district_id FROM districts WHERE UPPER(district_id) = $1`, [orgId]);
    return result.rows[0] ? { identity: { district_id: result.rows[0].district_id } } : { error: 'Select a valid district.' };
  }
  const result = await client.query(`SELECT county_id FROM counties WHERE UPPER(county_id) = $1`, [orgId]);
  return result.rows[0] ? { identity: { county_id: result.rows[0].county_id } } : { error: 'Select a valid county.' };
}

router.post('/signup', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const username = String(req.body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–100 characters using letters, numbers, dot, underscore, or hyphen.' });
  }

  const client = await pool.connect();
  let createdUserId = null;
  let generatedPassword = null;
  let verification = {};
  let claimedSeededUser = null;
  try {
    await client.query('BEGIN');
    const identityResult = await resolveRegistrationIdentity(client, req.body);
    if (identityResult.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: identityResult.error });
    }
    const { identity } = identityResult;
    const role = req.body.role;
    const linkage = {
      driver_id: identity.driver_id || null,
      parent_id: identity.parent_id || null,
      school_id: identity.school_id || null,
      district_id: identity.district_id || null,
      teacher_id: identity.teacher_id || null,
      county_id: identity.county_id || null,
    };
    const claimResult = await client.query(
      `SELECT * FROM users WHERE signup_required = TRUE AND role = $1
       AND (($2::varchar IS NOT NULL AND driver_id = $2)
         OR ($3::varchar IS NOT NULL AND parent_id = $3)
         OR ($4::varchar IS NOT NULL AND school_id = $4 AND role = 'school_admin')
         OR ($5::varchar IS NOT NULL AND district_id = $5 AND role = 'district_admin')
         OR ($6::varchar IS NOT NULL AND teacher_id = $6)
         OR ($7::varchar IS NOT NULL AND county_id = $7 AND role = 'county_admin'))
       LIMIT 1`,
      [role, linkage.driver_id, linkage.parent_id, linkage.school_id, linkage.district_id, linkage.teacher_id, linkage.county_id],
    );
    const claim = claimResult.rows[0];
    const existing = await client.query(
      `SELECT user_id FROM users WHERE (LOWER(username) = $1 OR LOWER(email) = $2)
         AND ($3::varchar IS NULL OR user_id <> $3) LIMIT 1`,
      [username, email, claim?.user_id || null],
    );
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That username or email already belongs to an account. Sign in or contact your organization administrator.' });
    }

    generatedPassword = generateOneTimePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 12);
    let inserted;
    if (claim) {
      claimedSeededUser = claim;
      createdUserId = claim.user_id;
      inserted = await client.query(
        `UPDATE users SET username = $2, email = $3, password_hash = $4,
          email_verified = FALSE, password_change_required = TRUE,
          password_expires_at = NOW() + ($5 * INTERVAL '1 hour'), signup_required = FALSE,
          totp_secret = NULL, totp_enabled = FALSE
         WHERE user_id = $1 AND signup_required = TRUE RETURNING *`,
        [claim.user_id, username, email, passwordHash, PASSWORD_TTL_HOURS],
      );
      if (!inserted.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This linked identity has already been activated. Sign in or contact your administrator.' });
      }
    } else {
      createdUserId = `USR${crypto.randomBytes(8).toString('hex')}`;
      inserted = await client.query(
        `INSERT INTO users (user_id, username, email, password_hash, role, driver_id, parent_id, school_id, district_id, teacher_id, county_id, email_verified, password_change_required, password_expires_at, signup_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,TRUE,NOW() + ($12 * INTERVAL '1 hour'),FALSE)
         RETURNING *`,
        [createdUserId, username, email, passwordHash, role, linkage.driver_id, linkage.parent_id, linkage.school_id, linkage.district_id, linkage.teacher_id, linkage.county_id, PASSWORD_TTL_HOURS],
      );
    }
    await client.query('COMMIT');

    try {
      await sendGeneratedPassword(email, username, generatedPassword);
      verification = await issueEmailCode(inserted.rows[0], 'VERIFY_EMAIL');
    } catch (emailError) {
      if (claimedSeededUser) {
        await pool.query(`DELETE FROM email_login_codes WHERE user_id = $1 AND consumed_at IS NULL`, [claimedSeededUser.user_id]);
        await pool.query(
          `UPDATE users SET username = $2, email = $3, password_hash = $4,
             email_verified = $5, password_change_required = $6, password_expires_at = $7,
             signup_required = TRUE, totp_secret = $8, totp_enabled = $9
           WHERE user_id = $1`,
          [claimedSeededUser.user_id, claimedSeededUser.username, claimedSeededUser.email,
            claimedSeededUser.password_hash, claimedSeededUser.email_verified,
            claimedSeededUser.password_change_required, claimedSeededUser.password_expires_at,
            claimedSeededUser.totp_secret, claimedSeededUser.totp_enabled],
        );
        await pool.query(`DELETE FROM email_login_codes WHERE user_id = $1 AND consumed_at IS NULL`, [claimedSeededUser.user_id]);
      } else {
        await pool.query(`DELETE FROM users WHERE user_id = $1`, [createdUserId]);
      }
      console.error('Signup email delivery failed:', emailError.message);
      return res.status(503).json({ error: 'We could not send account credentials. Please try later or contact your organization administrator.' });
    }

    return res.status(201).json({
      message: 'Account created. A one-time password and verification code were sent to your registered email.',
      username,
      email,
      email_code_required: true,
      password_change_required: true,
      ...(process.env.NODE_ENV === 'production' ? {} : { development_temporary_password: generatedPassword }),
      ...verification,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction already closed */ }
    if (createdUserId) await pool.query(`DELETE FROM users WHERE user_id = $1`, [createdUserId]).catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: 'That email or username is already registered.' });
    console.error('Signup failed:', error);
    return res.status(500).json({ error: 'Unable to create the account.' });
  } finally {
    client.release();
  }
});

router.post('/request-email-code', async (req, res) => {
  const identifier = String(req.body.login || '').trim();
  if (!identifier) return res.status(400).json({ error: 'Email or username is required.' });
  const result = await pool.query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1`,
    [identifier],
  );
  const user = result.rows[0];
  try {
    if (user?.email && !user.signup_required && !user.totp_enabled) {
      await issueEmailCode(user, user.email_verified ? 'LOGIN' : 'VERIFY_EMAIL');
    }
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.message || 'Email code delivery is unavailable.' });
  }
  return res.json({ message: 'If the account is eligible, a one-time code was sent to its registered email.' });
});

router.post('/verify-email', async (req, res) => {
  const identifier = String(req.body.login || '').trim();
  const code = String(req.body.code || '').trim();
  if (!identifier || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Email/username and a six-digit code are required.' });
  const result = await pool.query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1`,
    [identifier],
  );
  const user = result.rows[0];
  if (!user || user.signup_required || user.email_verified || !(await verifyEmailCode(user, code))) {
    return res.status(401).json({ error: 'Verification code is invalid or expired.' });
  }
  const updated = await pool.query(`UPDATE users SET email_verified = TRUE WHERE user_id = $1 RETURNING *`, [user.user_id]);
  return res.json({ message: 'Email verified. Sign in to continue.', user: authUser(updated.rows[0]) });
});

router.post('/login', async (req, res) => {
  const identifier = String(req.body.login || req.body.username || req.body.email || '').trim();
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(400).json({ error: 'Email/username and password are required.' });
  const result = await pool.query(
    `SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
    [identifier],
  );
  const user = result.rows[0];
  if (user?.signup_required) {
    return res.status(403).json({ error: 'Activate this linked account using Create Account. Your organization ID and registered email are required.' });
  }
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid sign-in credentials.' });
  }
  if (user.password_expires_at && new Date(user.password_expires_at) < new Date()) {
    return res.status(401).json({ error: 'Temporary password expired. Contact the school or district office for a new invitation.' });
  }
  if (!user.email_verified) return res.status(403).json({ error: 'Verify the registered email address before signing in.' });

  if (user.totp_enabled) {
    if (!authenticator.check(String(req.body.otp || ''), decryptTotpSecret(user.totp_secret))) {
      return res.status(401).json({ error: 'A valid authenticator-app code is required.' });
    }
  } else if (req.body.verification_code) {
    if (!(await verifyEmailCode(user, req.body.verification_code))) {
      return res.status(401).json({ error: 'Email sign-in code is invalid or expired.' });
    }
  } else {
    try {
      const verification = await issueEmailCode(user, 'LOGIN');
      return res.status(202).json({ email_code_required: true, message: 'A sign-in code was sent to your registered email.', ...verification });
    } catch (error) {
      return res.status(error.status || 503).json({ error: error.message || 'Email code delivery is unavailable.' });
    }
  }

  return res.json({ ...signToken(user), password_change_required: Boolean(user.password_change_required) });
});

router.post('/change-password', async (req, res) => {
  const { token, current_password: currentPassword, new_password: newPassword } = req.body;
  if (!token || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    return res.status(400).json({ error: 'A new password of 12–128 characters is required.' });
  }
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid or expired sign-in token.' }); }
  const userResult = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [payload.user_id]);
  const user = userResult.rows[0];
  if (!user || !(await bcrypt.compare(String(currentPassword || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await pool.query(
    `UPDATE users SET password_hash = $2, password_change_required = FALSE, password_expires_at = NULL WHERE user_id = $1 RETURNING *`,
    [user.user_id, passwordHash],
  );
  return res.json(signToken(updated.rows[0]));
});

router.post('/totp/setup', async (req, res) => {
  let payload;
  try { payload = jwt.verify(String(req.body.token || ''), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Sign in before setting up authenticator OTP.' }); }
  const result = await pool.query(`SELECT * FROM users WHERE user_id = $1 AND email_verified = TRUE AND password_change_required = FALSE`, [payload.user_id]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'Verified account not found.' });
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email || user.username, 'InfraShield', secret);
  await pool.query(`UPDATE users SET totp_secret = $2, totp_enabled = FALSE WHERE user_id = $1`, [user.user_id, encryptTotpSecret(secret)]);
  return res.json({ secret, otpauth_url: otpauthUrl, message: 'Add this secret to your authenticator app, then verify a code to enable app OTP.' });
});

router.post('/totp/verify', async (req, res) => {
  let payload;
  try { payload = jwt.verify(String(req.body.token || ''), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid or expired sign-in token.' }); }
  const result = await pool.query(`SELECT * FROM users WHERE user_id = $1 AND email_verified = TRUE AND password_change_required = FALSE`, [payload.user_id]);
  const user = result.rows[0];
  if (!user?.totp_secret || !authenticator.check(String(req.body.otp || ''), decryptTotpSecret(user.totp_secret))) {
    return res.status(401).json({ error: 'Invalid authenticator code.' });
  }
  const updated = await pool.query(`UPDATE users SET totp_enabled = TRUE WHERE user_id = $1 RETURNING *`, [user.user_id]);
  return res.json({ message: 'Authenticator OTP enabled.', user: authUser(updated.rows[0]) });
});

module.exports = router;
