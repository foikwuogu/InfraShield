import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api/client.js';
import AlertBanner from '../components/AlertBanner.jsx';

const STATUS_BADGE = {
  DROPPED_OFF: { label: 'Present · Transported', cls: 'badge-good' },
  PRESENT_TRANSPORTED: { label: 'Present · Transported', cls: 'badge-good' },
  EXCUSED_TRANSPORT_DELAY: { label: 'Excused · Transport Delay', cls: 'badge-warn' },
  BOARDED: { label: 'On Bus', cls: 'badge-info' },
};

export default function SchoolDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.schoolDashboard(user.school_id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [user.school_id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">Loading attendance office view…</div>;

  const { summary, students } = data;

  return (
    <div className="page">
      <AlertBanner />
      <div className="page-header">
        <div>
          <h2>Attendance Office</h2>
          <p className="muted">Live transportation-linked attendance</p>
        </div>
        <div className="stat-row">
          <div className="stat"><span className="stat-value">{summary.expected}</span><span className="stat-label">Expected</span></div>
          <div className="stat stat-good"><span className="stat-value">{summary.present}</span><span className="stat-label">Present</span></div>
          <div className="stat stat-info"><span className="stat-value">{summary.in_transit}</span><span className="stat-label">In transit</span></div>
          <div className="stat stat-warn"><span className="stat-value">{summary.excused_transport_delay}</span><span className="stat-label">Excused delay</span></div>
          <div className="stat stat-bad"><span className="stat-value">{summary.absent}</span><span className="stat-label">Absent</span></div>
        </div>
      </div>

      <section className="panel">
        <h3>Student attendance and trip times</h3>
        <div className="table-scroll" role="region" aria-label="Student attendance status; swipe horizontally to see all columns" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr><th>Student</th><th>Class</th><th>AM boarded</th><th>AM arrival</th><th>PM boarded</th><th>PM drop-off</th><th>Bus</th><th>Transport status</th></tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const badge = STATUS_BADGE[s.attendance_status];
              return (
                <tr key={s.student_id}>
                  <td>{s.first_name} {s.last_name}</td>
                  <td>{s.class_attendance_status || '—'}</td>
                  <td>{s.board_time ? new Date(s.board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{s.drop_off_time ? new Date(s.drop_off_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{s.afternoon_board_time ? new Date(s.afternoon_board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{s.afternoon_drop_off_time ? new Date(s.afternoon_drop_off_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{s.bus_number || '—'}</td>
                  <td>{badge ? <span className={`badge ${badge.cls}`}>{badge.label}</span> : <span className="badge badge-neutral">Not yet boarded</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
