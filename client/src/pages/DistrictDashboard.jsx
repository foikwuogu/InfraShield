import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api/client.js';
import AlertBanner from '../components/AlertBanner.jsx';

export default function DistrictDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [error, setError] = useState('');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSeverity, setAlertSeverity] = useState('WARNING');
  const [banner, setBanner] = useState('');

  const load = useCallback(async () => {
    try {
      const [dashboardRes, availabilityRes] = await Promise.all([
        api.districtDashboard(user.district_id),
        api.driverAvailability(),
      ]);
      setData(dashboardRes);
      setAvailability(availabilityRes);
    } catch (err) {
      setError(err.message);
    }
  }, [user.district_id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleIssueAlert(e) {
    e.preventDefault();
    if (!alertTitle || !alertMessage) return;
    try {
      await api.createAlert({
        scope: 'DISTRICT',
        district_id: user.district_id,
        severity: alertSeverity,
        title: alertTitle,
        message: alertMessage,
      });
      setBanner('Alert broadcast to the district.');
      setAlertTitle('');
      setAlertMessage('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMarkOut(driverId) {
    try {
      await api.setDriverAvailability(driverId, { status: 'OUT', reason: 'Marked out by dispatch' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignSubstitute(driverId) {
    const assignmentId = window.prompt('Assignment ID to cover (from today\'s driver_assignments table):');
    if (!assignmentId) return;
    try {
      await api.assignSubstitute({ assignment_id: assignmentId, substitute_driver_id: driverId, reason: 'Dispatch substitute assignment' });
      setBanner('Substitute assigned.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">Loading district command center…</div>;

  const { summary, schools = [], active_delays: activeDelays } = data;

  return (
    <div className="page">
      <AlertBanner />
      <div className="page-header">
        <div>
          <h2>District command center</h2>
          <p className="muted">District-wide transportation and attendance snapshot</p>
        </div>
      </div>

      {banner && <div className="alert alert-success">{banner}</div>}

      <div className="stat-row wide">
        <div className="stat"><span className="stat-value">{summary.schools}</span><span className="stat-label">Schools</span></div>
        <div className="stat"><span className="stat-value">{summary.buses}</span><span className="stat-label">Buses</span></div>
        <div className="stat"><span className="stat-value">{summary.drivers}</span><span className="stat-label">Active drivers</span></div>
        <div className="stat stat-good"><span className="stat-value">{summary.students_transported_today}</span><span className="stat-label">Students transported today</span></div>
        <div className="stat stat-warn"><span className="stat-value">{summary.delayed_routes}</span><span className="stat-label">Delayed routes</span></div>
        <div className="stat stat-info"><span className="stat-value">{summary.attendance_adjustments_today}</span><span className="stat-label">Tardy overrides today</span></div>
      </div>

      <section className="panel">
        <h3>Schools and live attendance</h3>
        <div className="table-scroll" role="region" aria-label="Schools and live attendance; swipe horizontally to see all columns" tabIndex={0}>
        <table className="data-table">
          <thead><tr><th>School</th><th>Expected</th><th>Present</th><th>In transit</th></tr></thead>
          <tbody>
            {schools.map((school) => (
              <tr key={school.school_id}>
                <td>{school.school_name}</td>
                <td>{school.expected}</td>
                <td>{school.present}</td>
                <td>{school.in_transit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h3>Active delays</h3>
          {activeDelays.length === 0 ? (
            <div className="empty-state">No active delays. All routes on schedule.</div>
          ) : (
            <div className="table-scroll" role="region" aria-label="Active delays; swipe horizontally to see all columns" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr><th>Route</th><th>Bus</th><th>Driver</th><th>Reason</th><th>Delay</th><th>Reported</th></tr>
              </thead>
              <tbody>
                {activeDelays.map((d) => (
                  <tr key={d.delay_id}>
                    <td>{d.route_name || '—'}</td>
                    <td>{d.bus_number || '—'}</td>
                    <td>{d.driver_first_name ? `${d.driver_first_name} ${d.driver_last_name}` : '—'}</td>
                    <td>{d.delay_reason}</td>
                    <td><span className={`badge ${d.delay_minutes > 10 ? 'badge-warn' : 'badge-neutral'}`}>{d.delay_minutes} min</span></td>
                    <td className="muted small">{new Date(d.reported_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Issue a district alert</h3>
          <form onSubmit={handleIssueAlert} className="stacked-form">
            <label>
              Title
              <input value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} placeholder="Severe weather advisory" required />
            </label>
            <label>
              Message
              <input value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)} placeholder="All afternoon routes delayed 30 minutes." required />
            </label>
            <label>
              Severity
              <select value={alertSeverity} onChange={(e) => setAlertSeverity(e.target.value)}>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
            <button className="btn btn-primary" type="submit">Broadcast alert</button>
          </form>
        </section>
      </div>

      <section className="panel">
        <h3>Driver availability &amp; substitutes</h3>
        <div className="table-scroll" role="region" aria-label="Driver availability; swipe horizontally to see all columns" tabIndex={0}>
        <table className="data-table">
          <thead><tr><th>Driver</th><th>Status</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {availability.map((d) => (
              <tr key={d.driver_id}>
                <td>{d.first_name} {d.last_name}</td>
                <td><span className={`badge ${d.availability_status === 'AVAILABLE' ? 'badge-good' : 'badge-warn'}`}>{d.availability_status}</span></td>
                <td className="muted small">{d.reason || '—'}</td>
                <td className="panel-actions">
                  {d.availability_status !== 'OUT' && (
                    <button className="btn btn-small" onClick={() => handleMarkOut(d.driver_id)}>Mark out</button>
                  )}
                  {d.availability_status === 'AVAILABLE' && (
                    <button className="btn btn-small" onClick={() => handleAssignSubstitute(d.driver_id)}>Assign as substitute</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
