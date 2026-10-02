import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api/client.js';
import AlertBanner from '../components/AlertBanner.jsx';
import OperationsInsights from '../components/OperationsInsights.jsx';

export default function CountyDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.countyDashboard(user.county_id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [user.county_id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">Loading county rollup…</div>;

  const { summary, districts } = data;

  return (
    <div className="page">
      <AlertBanner />
      <div className="page-header">
        <div>
          <h2>County command center</h2>
          <p className="muted">Rollup across every district in the county</p>
        </div>
      </div>

      <div className="stat-row wide">
        <div className="stat"><span className="stat-value">{summary.districts}</span><span className="stat-label">Districts</span></div>
        <div className="stat"><span className="stat-value">{summary.schools}</span><span className="stat-label">Schools</span></div>
        <div className="stat"><span className="stat-value">{summary.buses}</span><span className="stat-label">Buses</span></div>
        <div className="stat stat-good"><span className="stat-value">{summary.students_transported_today}</span><span className="stat-label">Transported today</span></div>
        <div className="stat stat-warn"><span className="stat-value">{summary.delayed_routes}</span><span className="stat-label">Delayed routes</span></div>
        <div className="stat stat-bad"><span className="stat-value">{summary.active_alerts}</span><span className="stat-label">Active alerts</span></div>
      </div>

      <OperationsInsights />

      <section className="panel">
        <h3>By district</h3>
        <div className="table-scroll" role="region" aria-label="District summary; swipe horizontally to see all columns" tabIndex={0}>
        <table className="data-table">
          <thead><tr><th>District</th><th>Schools</th><th>Students</th></tr></thead>
          <tbody>
            {districts.map((d) => (
              <tr key={d.district_id}>
                <td>{d.district_name}</td>
                <td>{d.schools}</td>
                <td>{d.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
