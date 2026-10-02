import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api/client.js';
import AlertBanner from '../components/AlertBanner.jsx';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [attendanceDrafts, setAttendanceDrafts] = useState({});
  const [attendanceBusy, setAttendanceBusy] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [activeStudentId, setActiveStudentId] = useState('');
  const [thread, setThread] = useState(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageBusy, setMessageBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.teacherDashboard(user.teacher_id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [user.teacher_id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const loadInbox = useCallback(async () => {
    try {
      setInbox(await api.messageInbox());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  async function loadThread(studentId) {
    setActiveStudentId(studentId);
    try {
      setThread(await api.studentMessages(studentId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveAttendance(student) {
    const status = attendanceDrafts[student.student_id] || student.class_attendance_status || 'PRESENT';
    setAttendanceBusy(student.student_id);
    setNotice('');
    try {
      await api.markClassAttendance(student.student_id, { status });
      setNotice(`Class attendance saved for ${student.first_name} ${student.last_name}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAttendanceBusy(null);
    }
  }

  async function sendMessage() {
    if (!activeStudentId || !messageDraft.trim()) return;
    setMessageBusy(true);
    try {
      await api.sendStudentMessage(activeStudentId, { body: messageDraft.trim() });
      setMessageDraft('');
      await loadThread(activeStudentId);
      await loadInbox();
      setNotice('Message sent to the parent.');
    } catch (err) {
      setError(err.message);
    } finally {
      setMessageBusy(false);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">Loading class roster…</div>;

  const { teacher, summary, students } = data;

  return (
    <div className="page">
      <AlertBanner />
      <div className="page-header">
        <div>
          <h2>Grade {teacher.grade_level} · Room {teacher.room_number}</h2>
          <p className="muted">{teacher.first_name} {teacher.last_name}'s roster</p>
        </div>
        <div className="stat-row">
          <div className="stat"><span className="stat-value">{summary.total}</span><span className="stat-label">Total</span></div>
          <div className="stat stat-good"><span className="stat-value">{summary.present}</span><span className="stat-label">Present</span></div>
          <div className="stat stat-info"><span className="stat-value">{summary.on_bus}</span><span className="stat-label">On bus</span></div>
          <div className="stat stat-warn"><span className="stat-value">{summary.not_yet_boarded}</span><span className="stat-label">Not yet boarded</span></div>
          <div className="stat stat-bad"><span className="stat-value">{summary.absent}</span><span className="stat-label">Class absences</span></div>
        </div>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}

      <section className="panel">
        <h3>Class attendance and morning bus</h3>
        <div className="table-scroll" role="region" aria-label="Student roster; swipe horizontally to see all columns" tabIndex={0}>
        <table className="data-table">
          <thead><tr><th>Student</th><th>AM bus</th><th>Class attendance</th><th></th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.student_id}>
                <td>{s.first_name} {s.last_name}</td>
                <td>
                  {s.board_time ? <span className="badge badge-good">Boarded {new Date(s.board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : <span className="badge badge-neutral">Not boarded</span>}
                </td>
                <td>
                  <select aria-label={`Class attendance for ${s.first_name} ${s.last_name}`} value={attendanceDrafts[s.student_id] || s.class_attendance_status || ''} onChange={(e) => setAttendanceDrafts((current) => ({ ...current, [s.student_id]: e.target.value }))}>
                    <option value="" disabled>Mark attendance</option>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="LATE">Late</option>
                    <option value="EXCUSED">Excused</option>
                  </select>
                </td>
                <td><button className="btn btn-small" type="button" disabled={attendanceBusy === s.student_id || !(attendanceDrafts[s.student_id] || s.class_attendance_status)} onClick={() => saveAttendance(s)}>{attendanceBusy === s.student_id ? 'Saving…' : 'Save'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="panel teacher-messages">
        <h3>Messages from families</h3>
        {inbox.length === 0 ? <p className="muted">No conversations yet. Select a student to start a message with their parent.</p> : (
          <div className="message-inbox">
            {inbox.map((conversation) => (
              <button className={`inbox-item${activeStudentId === conversation.student_id ? ' active' : ''}`} type="button" key={conversation.conversation_id} onClick={() => loadThread(conversation.student_id)}>
                <strong>{conversation.student_first_name} {conversation.student_last_name}</strong>
                <span>{conversation.parent_first_name} {conversation.parent_last_name}</span>
                <small>{conversation.last_message}</small>
              </button>
            ))}
          </div>
        )}
        <label className="message-compose">
          <span>Student / family</span>
          <select value={activeStudentId} onChange={(e) => loadThread(e.target.value)}>
            <option value="">Choose a student</option>
            {students.map((student) => <option key={student.student_id} value={student.student_id}>{student.first_name} {student.last_name}</option>)}
          </select>
        </label>
        {thread && activeStudentId && (
          <div className="message-thread">
            {thread.messages.map((message) => (
              <div className={`message-bubble ${message.sender_role === 'teacher' ? 'message-mine' : ''}`} key={message.message_id}>
                <strong>{message.sender_role === 'teacher' ? 'You' : 'Parent'}</strong>
                <div>{message.body}</div>
                <time>{new Date(message.sent_at).toLocaleString()}</time>
              </div>
            ))}
            {thread.messages.length === 0 && <p className="muted small">No messages in this conversation yet.</p>}
            <label className="message-compose">
              <span>Reply to parent</span>
              <textarea maxLength={2000} value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} placeholder="Write a message to the family…" />
            </label>
            <button className="btn btn-primary" type="button" disabled={messageBusy || !messageDraft.trim()} onClick={sendMessage}>{messageBusy ? 'Sending…' : 'Send message'}</button>
          </div>
        )}
      </section>
    </div>
  );
}
