const pool = require('../db/pool');

function hasTwilioConfig() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

async function queueAndSendSms({ outboxId, tripId, studentId, parentId, phone, body }) {
  if (!phone) return { status: 'NO_PHONE' };

  await pool.query(
    `INSERT INTO notification_outbox
       (outbox_id, trip_id, student_id, parent_id, notification_type, channel, destination, message_body, status)
     VALUES ($1,$2,$3,$4,'BUS_ARRIVAL_10_MIN','SMS',$5,$6,$7)
     ON CONFLICT (trip_id, student_id, notification_type, channel) DO NOTHING`,
    [outboxId, tripId, studentId, parentId, phone, body, hasTwilioConfig() ? 'PENDING' : 'NOT_CONFIGURED']
  );

  if (!hasTwilioConfig()) return { status: 'NOT_CONFIGURED' };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`;
  const form = new URLSearchParams({
    To: phone,
    From: process.env.TWILIO_FROM_NUMBER,
    Body: body,
  });
  const authorization = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    await pool.query(
      `UPDATE notification_outbox
       SET status = $2, provider_message_id = $3, attempt_count = attempt_count + 1,
           last_error = $4, updated_at = NOW()
       WHERE outbox_id = $1`,
      [outboxId, response.ok ? 'SENT' : 'FAILED', result.sid || null,
        response.ok ? null : (result.message || `Twilio HTTP ${response.status}`).slice(0, 1000)]
    );
    return { status: response.ok ? 'SENT' : 'FAILED' };
  } catch (error) {
    await pool.query(
      `UPDATE notification_outbox
       SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = $2, updated_at = NOW()
       WHERE outbox_id = $1`,
      [outboxId, error.message.slice(0, 1000)]
    );
    return { status: 'FAILED' };
  }
}

module.exports = { queueAndSendSms };
