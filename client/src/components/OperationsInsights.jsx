import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function OperationsInsights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api.operationsInsights());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <section className="panel operations-insights" aria-labelledby="operations-insights-title">
      <div className="page-header">
        <div>
          <h3 id="operations-insights-title">Live operations intelligence</h3>
          <p className="muted">Explainable checks for stale GPS, boarding gaps, driver status, and prolonged delays. Recommendations are decision support; staff remain in control.</p>
        </div>
        <button className="btn btn-small" type="button" onClick={refresh} disabled={busy}>
          {busy ? 'Checking…' : 'Refresh checks'}
        </button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {data ? (
        <>
          <div className="insight-summary" aria-live="polite">
            <span>{data.summary.critical} critical</span>
            <span>{data.summary.warning} warnings</span>
            <span>Rules {data.evaluation.replace('rules-', '')}</span>
            <span className="muted small">Checked {new Date(data.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {data.insights.length === 0 ? (
            <div className="empty-state">No operational exceptions detected in the current snapshot.</div>
          ) : (
            <div className="insight-list">
              {data.insights.map((item) => (
                <article className={`insight-card insight-${item.severity.toLowerCase()}`} key={item.id}>
                  <div className="insight-heading">
                    <strong>{item.title}</strong>
                    <span className={`badge ${item.severity === 'CRITICAL' ? 'badge-bad' : 'badge-warn'}`}>{item.severity}</span>
                  </div>
                  <p>{item.message}</p>
                  <p className="muted small">{item.school_name} · {item.bus_number || 'No bus'} · {item.category.replaceAll('_', ' ')}</p>
                  <p className="insight-recommendation"><strong>Suggested next step:</strong> {item.recommendation}</p>
                </article>
              ))}
            </div>
          )}
        </>
      ) : !error ? <div className="muted">Running scoped operations checks…</div> : null}
    </section>
  );
}
