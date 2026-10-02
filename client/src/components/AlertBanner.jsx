import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const SEVERITY_CLASS = {
  INFO: 'alert-info-banner',
  WARNING: 'alert-warn-banner',
  CRITICAL: 'alert-critical-banner',
};

export default function AlertBanner() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await api.activeAlerts();
        if (!cancelled) setAlerts(rows);
      } catch {
        // Silently ignore — a broken alert feed shouldn't block the dashboard.
      }
    }
    load();
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="alert-banner-stack">
      {alerts.map((a) => (
        <div key={a.alert_id} className={`alert-banner ${SEVERITY_CLASS[a.severity] || 'alert-info-banner'}`}>
          <strong>{a.title}</strong>
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
}
