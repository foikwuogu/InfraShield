const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function getAuthorizedPair(req, studentId, requestedTeacherId) {
  if (!['parent', 'teacher'].includes(req.user.role)) {
    return { error: { status: 403, message: 'Parent or teacher account required' } };
  }

  const { rows } = await pool.query(
    `SELECT s.student_id, s.first_name, s.last_name, s.school_id, s.grade_level, s.parent_id,
            pg.first_name AS parent_first_name, pg.last_name AS parent_last_name,
            t.teacher_id, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
     FROM students s
     JOIN parents_guardians pg ON pg.parent_id = s.parent_id
     JOIN teachers t ON t.school_id = s.school_id AND t.grade_level = s.grade_level
     WHERE s.student_id = $1
       AND ($2::varchar IS NULL OR t.teacher_id = $2)
       AND ($3::varchar IS NULL OR s.parent_id = $3)
       AND ($4::varchar IS NULL OR t.teacher_id = $4)
     ORDER BY t.teacher_id
     LIMIT 1`,
    [studentId, requestedTeacherId || null,
      req.user.role === 'parent' ? req.user.parent_id : null,
      req.user.role === 'teacher' ? req.user.teacher_id : null]
  );

  if (!rows[0]) return { error: { status: 404, message: 'Student or assigned teacher not found' } };
  return { pair: rows[0] };
}

router.get('/messages/inbox', requireAuth, async (req, res) => {
  if (!['parent', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Parent or teacher account required' });
  }

  const { rows } = await pool.query(
    `SELECT c.conversation_id, c.student_id, s.first_name AS student_first_name,
            s.last_name AS student_last_name, c.parent_id, c.teacher_id,
            t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
            pg.first_name AS parent_first_name, pg.last_name AS parent_last_name,
            c.updated_at,
            (SELECT body FROM parent_teacher_messages m WHERE m.conversation_id = c.conversation_id ORDER BY sent_at DESC LIMIT 1) AS last_message
     FROM parent_teacher_conversations c
     JOIN students s ON s.student_id = c.student_id
     JOIN teachers t ON t.teacher_id = c.teacher_id
     JOIN parents_guardians pg ON pg.parent_id = c.parent_id
     WHERE ($1::varchar = 'parent' AND c.parent_id = $2)
        OR ($1::varchar = 'teacher' AND c.teacher_id = $3)
     ORDER BY c.updated_at DESC`,
    [req.user.role, req.user.parent_id || null, req.user.teacher_id || null]
  );

  res.json(rows);
});

router.get('/messages/student/:studentId', requireAuth, async (req, res) => {
  const pairResult = await getAuthorizedPair(req, req.params.studentId, req.query.teacher_id);
  if (pairResult.error) return res.status(pairResult.error.status).json({ error: pairResult.error.message });
  const { pair } = pairResult;

  const conversationRes = await pool.query(
    `SELECT conversation_id FROM parent_teacher_conversations
     WHERE student_id = $1 AND parent_id = $2 AND teacher_id = $3`,
    [pair.student_id, pair.parent_id, pair.teacher_id]
  );
  const conversation = conversationRes.rows[0];
  if (!conversation) return res.json({ conversation_id: null, student: pair, messages: [] });

  const messagesRes = await pool.query(
    `SELECT m.message_id, m.sender_user_id, u.username AS sender_username, u.role AS sender_role,
            m.body, m.sent_at, m.read_at
     FROM parent_teacher_messages m
     JOIN users u ON u.user_id = m.sender_user_id
     WHERE m.conversation_id = $1
     ORDER BY m.sent_at ASC LIMIT 200`,
    [conversation.conversation_id]
  );

  await pool.query(
    `UPDATE parent_teacher_messages SET read_at = NOW()
     WHERE conversation_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`,
    [conversation.conversation_id, req.user.user_id]
  );

  res.json({ conversation_id: conversation.conversation_id, student: pair, messages: messagesRes.rows });
});

router.post('/messages/student/:studentId', requireAuth, async (req, res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 2000) {
    return res.status(400).json({ error: 'Message must be between 1 and 2000 characters' });
  }

  const pairResult = await getAuthorizedPair(req, req.params.studentId, req.body.teacher_id);
  if (pairResult.error) return res.status(pairResult.error.status).json({ error: pairResult.error.message });
  const { pair } = pairResult;

  const conversationId = newId('CONV');
  const conversationRes = await pool.query(
    `INSERT INTO parent_teacher_conversations (conversation_id, student_id, parent_id, teacher_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (student_id, parent_id, teacher_id)
     DO UPDATE SET updated_at = NOW()
     RETURNING conversation_id`,
    [conversationId, pair.student_id, pair.parent_id, pair.teacher_id]
  );
  const actualConversationId = conversationRes.rows[0].conversation_id;

  const messageRes = await pool.query(
    `INSERT INTO parent_teacher_messages (message_id, conversation_id, sender_user_id, body)
     VALUES ($1,$2,$3,$4)
     RETURNING message_id, sender_user_id, body, sent_at`,
    [newId('MSG'), actualConversationId, req.user.user_id, body]
  );

  if (req.user.role === 'teacher') {
    await pool.query(
      `INSERT INTO parent_notifications (notification_id, student_id, parent_id, notification_type, message, delivery_method, delivery_status)
       VALUES ($1,$2,$3,'TEACHER_MESSAGE',$4,'IN_APP','SENT')`,
      [newId('NTF'), pair.student_id, pair.parent_id, `New message from ${pair.teacher_first_name} ${pair.teacher_last_name} about ${pair.first_name}.`]
    );
  }

  await pool.query(`UPDATE parent_teacher_conversations SET updated_at = NOW() WHERE conversation_id = $1`, [actualConversationId]);
  res.status(201).json({ conversation_id: actualConversationId, message: messageRes.rows[0] });
});

router.post('/class-attendance/:studentId', requireAuth, async (req, res) => {
  if (req.user.role !== 'teacher' || !req.user.teacher_id) {
    return res.status(403).json({ error: 'Teacher account required' });
  }

  const { status, note = null } = req.body;
  if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(status)) {
    return res.status(400).json({ error: 'status must be PRESENT, ABSENT, LATE, or EXCUSED' });
  }

  const { rows } = await pool.query(
    `INSERT INTO class_attendance (student_id, attendance_date, status, marked_by, note, marked_at)
     SELECT s.student_id, CURRENT_DATE, $3, t.teacher_id, $4, NOW()
     FROM teachers t JOIN students s
       ON s.school_id = t.school_id AND s.grade_level = t.grade_level
     WHERE t.teacher_id = $1 AND s.student_id = $2
     ON CONFLICT (student_id, attendance_date)
     DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by,
                   note = EXCLUDED.note, marked_at = NOW()
     RETURNING *`,
    [req.user.teacher_id, req.params.studentId, status, note]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Student is not assigned to this teacher' });
  res.json(rows[0]);
});

router.post('/sms-preference', requireAuth, async (req, res) => {
  if (req.user.role !== 'parent' || !req.user.parent_id) {
    return res.status(403).json({ error: 'Parent account required' });
  }
  if (typeof req.body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false' });
  }
  const { rows } = await pool.query(
    `UPDATE parents_guardians
     SET sms_opt_in = $2, sms_opt_in_updated_at = NOW()
     WHERE parent_id = $1
     RETURNING parent_id, sms_opt_in, sms_opt_in_updated_at`,
    [req.user.parent_id, req.body.enabled]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Parent record not found' });
  res.json(rows[0]);
});

module.exports = router;