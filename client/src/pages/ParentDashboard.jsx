import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api/client.js';
import AlertBanner from '../components/AlertBanner.jsx';

export default function ParentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [routes, setRoutes] = useState({});
  const [threads, setThreads] = useState({});
  const [drafts, setDrafts] = useState({});
  const [busyStudent, setBusyStudent] = useState(null);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.parentDashboard(user.parent_id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [user.parent_id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!data) return undefined;
    setSmsOptIn(Boolean(data.children[0]?.sms_opt_in));
    let active = true;
    async function loadRoutes() {
      const routeResults = await Promise.all(data.children.map(async (child) => {
        try {
          return [child.student_id, await api.studentRoute(child.student_id, 'AFTERNOON')];
        } catch {
          return [child.student_id, null];
        }
      }));
      if (active) setRoutes(Object.fromEntries(routeResults));
    }
    loadRoutes();
    const interval = setInterval(loadRoutes, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [data]);

  async function loadThread(child) {
    try {
      const thread = await api.studentMessages(child.student_id, child.teacher_id);
      setThreads((current) => ({ ...current, [child.student_id]: thread }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendMessage(child) {
    const body = (drafts[child.student_id] || '').trim();
    if (!body || !child.teacher_id) return;
    setBusyStudent(child.student_id);
    try {
      await api.sendStudentMessage(child.student_id, { teacher_id: child.teacher_id, body });
      setDrafts((current) => ({ ...current, [child.student_id]: '' }));
      await loadThread(child);
      setNotice('Message sent to the student’s teacher.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyStudent(null);
    }
  }

  async function updateSmsPreference(enabled) {
    setSmsOptIn(enabled);
    setNotice('');
    try {
      await api.setSmsPreference(enabled);
      setNotice(enabled ? 'SMS alerts enabled.' : 'SMS alerts disabled.');
    } catch (err) {
      setSmsOptIn(!enabled);
      setError(err.message);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">Loading your children's status…</div>;

  return (
    <div className="page">
      <AlertBanner />
      <div className="page-header">
        <div>
          <h2>My children</h2>
          <p className="muted">Real-time transportation and attendance status</p>
        </div>
      </div>

      <div className="grid-cards">
        {data.children.map((c) => (
          <div className="card" key={c.student_id}>
            <div className="card-title">{c.first_name} {c.last_name}</div>
            <div className="muted">{c.school_name} · Grade {c.grade_level}</div>
            <div className="card-status">
              <span className={`badge ${c.class_attendance_status === 'PRESENT' ? 'badge-good' : c.class_attendance_status === 'ABSENT' ? 'badge-bad' : 'badge-neutral'}`}>
                Class: {c.class_attendance_status || 'Not recorded'}
              </span>
            </div>
            <div className="trip-times">
              <div><strong>Morning:</strong> {c.morning_board_time ? `boarded ${new Date(c.morning_board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'not boarded'}{c.morning_drop_off_time ? ` · school arrival ${new Date(c.morning_drop_off_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
              <div><strong>After school:</strong> {c.afternoon_board_time ? `boarded ${new Date(c.afternoon_board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'not boarded'}{c.afternoon_drop_off_time ? ` · home arrival ${new Date(c.afternoon_drop_off_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
            </div>
            {c.afternoon_bus_number && (
              <div className="card-meta">Bus {c.afternoon_bus_number} · Driver {c.afternoon_driver_first_name} {c.afternoon_driver_last_name}</div>
            )}
            {routes[c.student_id]?.available && (
              <div className="route-progress">
                <div className="route-progress-heading">After-school bus · {routes[c.student_id].trip_status.replaceAll('_', ' ').toLowerCase()}</div>
                {routes[c.student_id].eta_minutes != null ? (
                  <div className="route-eta">
                    {routes[c.student_id].eta_minutes <= 10
                      ? `Bus arriving in about ${routes[c.student_id].eta_minutes} min at ${routes[c.student_id].student_stop_name}`
                      : `Estimated ${routes[c.student_id].eta_minutes} min to ${routes[c.student_id].student_stop_name}`}
                  </div>
                ) : <div className="muted small">Waiting for the driver's next GPS update.</div>}
                {routes[c.student_id].next_stop && <div className="muted small">Next route stop: {routes[c.student_id].next_stop.stop_name}</div>}
                {routes[c.student_id].last_arrived_stop && <div className="muted small">Last stop: {routes[c.student_id].last_arrived_stop.stop_name} · {new Date(routes[c.student_id].last_arrived_stop.arrived_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
                {routes[c.student_id].location && (
                  <div className="muted small">
                    Updated {new Date(routes[c.student_id].location.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {routes[c.student_id].distance_meters_to_student_stop} m from drop-off ·{' '}
                    <a href={`https://www.openstreetmap.org/?mlat=${routes[c.student_id].location.latitude}&mlon=${routes[c.student_id].location.longitude}#map=15/${routes[c.student_id].location.latitude}/${routes[c.student_id].location.longitude}`} target="_blank" rel="noreferrer">View bus on map</a>
                  </div>
                )}
              </div>
            )}
            {c.teacher_id && (
              <details className="parent-teacher-thread">
                <summary>Message {c.teacher_first_name} {c.teacher_last_name}</summary>
                <div className="message-thread">
                  {(threads[c.student_id]?.messages || []).map((message) => (
                    <div className={`message-bubble ${message.sender_role === 'parent' ? 'message-mine' : ''}`} key={message.message_id}>
                      <strong>{message.sender_role === 'parent' ? 'You' : `${c.teacher_first_name} ${c.teacher_last_name}`}</strong>
                      <div>{message.body}</div>
                      <time>{new Date(message.sent_at).toLocaleString()}</time>
                    </div>
                  ))}
                  {!threads[c.student_id] && <button className="btn btn-small" type="button" onClick={() => loadThread(c)}>Load conversation</button>}
                  {threads[c.student_id] && threads[c.student_id].messages.length === 0 && <p className="muted small">Start a conversation with the teacher.</p>}
                  <label className="message-compose">
                    <span>Message about {c.first_name}</span>
                    <textarea maxLength={2000} value={drafts[c.student_id] || ''} onChange={(e) => setDrafts((current) => ({ ...current, [c.student_id]: e.target.value }))} placeholder="Write a message to the teacher…" />
                  </label>
                  <button className="btn btn-primary" type="button" disabled={busyStudent === c.student_id || !(drafts[c.student_id] || '').trim()} onClick={() => sendMessage(c)}>
                    {busyStudent === c.student_id ? 'Sending…' : 'Send message'}
                  </button>
                </div>
              </details>
            )}
          </div>
        ))}
        {data.children.length === 0 && <div className="empty-state">No students linked to this account.</div>}
      </div>

      <section className="panel">
        <h3>Text message alerts</h3>
        <label className="sms-consent">
          <input type="checkbox" checked={smsOptIn} onChange={(e) => updateSmsPreference(e.target.checked)} />
          <span>Send me SMS alerts when my child’s after-school bus is about 10 minutes from the stop. Standard message rates may apply. I can opt out here at any time.</span>
        </label>
        {!data.sms_delivery_configured && <p className="muted small">SMS provider is not configured yet. In-app arrival alerts remain enabled; district IT must configure Twilio before texts can be delivered.</p>}
        {notice && <div className="alert alert-success">{notice}</div>}
      </section>

      <section className="panel">
        <h3>Recent notifications</h3>
        <ul className="notification-list">
          {data.notifications.map((n) => (
            <li key={n.notification_id}>
              <span className={`dot dot-${n.notification_type.toLowerCase()}`} />
              <div>
                <div className="notification-message">{n.message}</div>
                <div className="muted small">{new Date(n.sent_time).toLocaleString()}</div>
              </div>
            </li>
          ))}
          {data.notifications.length === 0 && <li className="muted">No notifications yet today.</li>}
        </ul>
      </section>
    </div>
  );
}
