import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api/client.js';
import AlertBanner from '../components/AlertBanner.jsx';

export default function DriverDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const [busyStudent, setBusyStudent] = useState(null);
  const [schoolIdInput, setSchoolIdInput] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const [scanError, setScanError] = useState('');
  const [banner, setBanner] = useState('');
  const [endRouteResult, setEndRouteResult] = useState(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsTracking, setGpsTracking] = useState(false);
  const [busyDropoff, setBusyDropoff] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.driverDashboard(user.driver_id);
      setData(res);
    } catch (err) {
      setError(err.message);
    }
  }, [user.driver_id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!gpsTracking || !data?.assignment) return undefined;
    if (!navigator.geolocation) {
      setGpsTracking(false);
      setError('This device does not provide GPS. Use the demo location update instead.');
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(async (position) => {
      try {
        const result = await api.gpsPing({
          bus_id: data.assignment.bus_id,
          trip_id: data.assignment.trip_id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setBanner(
          `Live location updated${result.nearest_stop ? ` · ${result.nearest_stop.stop_name}${result.nearest_stop.within_geofence ? ' arrived' : ` · ${result.nearest_stop.distance_meters}m away`}` : ''}.` +
          (result.eta_alerts_sent ? ` ${result.eta_alerts_sent} parent arrival alert(s) sent.` : '')
        );
      } catch (err) {
        setError(err.message);
      }
    }, (geoError) => {
      setGpsTracking(false);
      setError(`Live GPS stopped: ${geoError.message}`);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsTracking, data?.assignment?.bus_id, data?.assignment?.trip_id]);

  async function handleBoard(studentId, verificationMethod = 'MANUAL', studentSchoolId = null) {
    if (!data?.assignment) return;
    setBusyStudent(studentId);
    setScanError('');
    try {
      await api.boardStudent({
        student_id: studentId,
        ...(studentSchoolId ? { student_school_id: studentSchoolId } : {}),
        bus_id: data.assignment.bus_id,
        trip_id: data.assignment.trip_id,
        verification_method: verificationMethod,
      });
      await load();
      setScanMessage(verificationMethod === 'SCHOOL_ID'
        ? 'School ID matched the trip roster. Boarding recorded.'
        : 'Manual identity check recorded.');
    } catch (err) {
      setScanError(err.message);
    } finally {
      setBusyStudent(null);
    }
  }

  async function handleSchoolIdSubmit(event) {
    event.preventDefault();
    setScanMessage('');
    setScanError('');
    const scannedId = schoolIdInput.trim().toUpperCase();
    if (!scannedId) return;
    const student = data.roster.find((entry) => entry.student_number?.trim().toUpperCase() === scannedId);
    if (!student) {
      setScanError('That school ID is not on this trip’s manifest. Check the ID and route before boarding.');
      return;
    }
    if (student.board_time) {
      setScanError(`${student.first_name} ${student.last_name} is already recorded on this trip.`);
      return;
    }
    setSchoolIdInput('');
    await handleBoard(student.student_id, 'SCHOOL_ID', student.student_number);
  }

  async function handleDropoff(student) {
    if (!student.trip_event_id) return;
    setBusyDropoff(student.student_id);
    try {
      await api.dropoffStudent(student.trip_event_id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyDropoff(null);
    }
  }

  async function handleReportDelay(e) {
    e.preventDefault();
    if (!data?.assignment || !delayMinutes) return;
    try {
      const res = await api.reportDelay({
        bus_id: data.assignment.bus_id,
        route_id: data.assignment.route_id,
        driver_id: user.driver_id,
        delay_reason: delayReason || 'Traffic',
        delay_minutes: Number(delayMinutes),
      });
      const excused = res.excused_students || [];
      setBanner(
        excused.length
          ? `Delay logged. ${excused.length} student(s) automatically excused from tardy status.`
          : 'Delay logged.'
      );
      setDelayMinutes('');
      setDelayReason('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGpsPing() {
    if (!data?.assignment) return;
    setGpsBusy(true);
    const target = data.roster.find((student) => !student.drop_off_time) || data.roster[0];

    async function recordPing(latitude, longitude, isSimulation = false) {
      const res = await api.gpsPing({
        bus_id: data.assignment.bus_id,
        trip_id: data.assignment.trip_id,
        latitude,
        longitude,
      });
      setBanner(
        `${isSimulation ? 'Simulated' : 'Live'} GPS update recorded.` +
        (res.nearest_stop ? ` Nearest stop: ${res.nearest_stop.stop_name} (${res.nearest_stop.distance_meters}m).` : '') +
        (res.nearest_stop?.within_geofence ? ' Stop arrival recorded.' : '') +
        (res.eta_alerts_sent ? ` ${res.eta_alerts_sent} parent arrival alert(s) sent.` : '')
      );
    }

    try {
      if (!navigator.geolocation) throw new Error('Device GPS is not available');
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }));
      await recordPing(position.coords.latitude, position.coords.longitude);
    } catch (geoError) {
      if (!target || target.latitude == null || target.longitude == null) {
        setError(geoError.message || 'Location unavailable and no route stop is available for simulation');
      } else {
        try {
          await recordPing(Number(target.latitude) + 0.02, Number(target.longitude) + 0.02, true);
        } catch (err) {
          setError(err.message);
        }
      }
    } finally {
      setGpsBusy(false);
    }
  }

  async function handleEndRoute() {
    if (!data?.assignment) return;
    if (!window.confirm('Confirm the route is complete and every student is off the bus?')) return;
    try {
      const res = await api.endRoute(data.assignment.bus_id, data.assignment.trip_id);
      setEndRouteResult(res);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading">Loading route…</div>;

  if (!data.assignment) {
    return <div className="empty-state">No route assignment found for today.</div>;
  }

  const { assignment, roster, summary } = data;

  return (
    <div className="page">
      <AlertBanner />
      <div className="page-header">
        <div>
          <h2>{assignment.route_name}</h2>
          <p className="muted">Bus {assignment.bus_number} · {assignment.shift_type} shift</p>
        </div>
        <div className="stat-row">
          <div className="stat"><span className="stat-value">{summary.expected}</span><span className="stat-label">Expected</span></div>
          <div className="stat stat-good"><span className="stat-value">{summary.boarded}</span><span className="stat-label">Boarded</span></div>
          <div className="stat stat-warn"><span className="stat-value">{summary.absent}</span><span className="stat-label">Not yet boarded</span></div>
        </div>
      </div>

      {banner && <div className="alert alert-success">{banner}</div>}
      {scanMessage && <div className="alert alert-success" role="status">{scanMessage}</div>}
      {endRouteResult && (
        <div className={`alert ${endRouteResult.cleared ? 'alert-success' : 'alert-error'}`}>
          {endRouteResult.cleared
            ? 'Route closed out — bus confirmed empty.'
            : `Route NOT cleared: ${endRouteResult.students_remaining.map((s) => s.name).join(', ')} still show boarded. A critical alert was raised.`}
        </div>
      )}

      <div className="grid-2 verification-grid">
        <section className="panel">
          <h3>Board with school ID</h3>
          <p className="muted">Scan a barcode/QR school card with a connected scanner, or type the school-issued student ID printed on the card.</p>
          <form className="stacked-form" onSubmit={handleSchoolIdSubmit}>
            <label htmlFor="student-school-id">Student school ID</label>
            <input
              id="student-school-id"
              value={schoolIdInput}
              onChange={(event) => setSchoolIdInput(event.target.value)}
              placeholder="Scan or enter school ID"
              autoComplete="off"
              autoCapitalize="characters"
              aria-describedby="school-id-help"
              required
            />
            <span className="muted small" id="school-id-help">The ID is checked against this route’s student manifest before boarding is saved.</span>
            <button className="btn btn-primary" type="submit" disabled={Boolean(busyStudent)}>Verify ID and board</button>
          </form>
          {scanError && <div className="alert alert-error" role="alert">{scanError}</div>}
        </section>

        <section className="panel">
          <h3>Bus identity devices</h3>
          <p className="muted">Biometric methods are not active until district-approved bus hardware and a secure verification provider are installed.</p>
          <ul className="verification-device-list">
            <li><span>School ID / barcode scanner</span><span className="badge badge-good">Available</span></li>
            <li><span>Manual identity check</span><span className="badge badge-good">Available</span></li>
            <li><span>AI camera face match</span><span className="badge badge-neutral">Device not connected</span></li>
            <li><span>Fingerprint reader</span><span className="badge badge-neutral">Device not connected</span></li>
            <li><span>Voice verification</span><span className="badge badge-neutral">Provider not connected</span></li>
          </ul>
          <p className="muted small">No face images, fingerprints, or voice recordings are captured or stored by this app.</p>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h3>Student manifest</h3>
          <div className="driver-roster-cards" role="list" aria-label="Student manifest">
            {roster.map((s) => (
              <div className="driver-roster-card" role="listitem" key={s.student_id}>
                <div>
                  <div className="driver-roster-name">{s.first_name} {s.last_name}</div>
                  <div className="driver-roster-stop muted">{s.stop_name} · ID {s.student_number}</div>
                </div>
                {s.board_time ? (
                  <div className="driver-roster-actions">
                    <span className={`badge ${s.drop_off_time ? 'badge-neutral' : 'badge-good'}`}>{s.drop_off_time ? `Dropped ${new Date(s.drop_off_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `Boarded ${new Date(s.board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span>
                    {!s.drop_off_time && s.trip_event_id && <button className="btn btn-small" disabled={busyDropoff === s.student_id} onClick={() => handleDropoff(s)}>{busyDropoff === s.student_id ? 'Saving…' : 'Drop off'}</button>}
                  </div>
                ) : (
                  <button
                    className="btn btn-small"
                    disabled={busyStudent === s.student_id}
                    onClick={() => handleBoard(s.student_id, 'MANUAL')}
                  >
                    {busyStudent === s.student_id ? 'Saving…' : 'Manual check'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="table-scroll driver-manifest-scroll" role="region" aria-label="Student manifest; swipe horizontally to see all columns" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr><th>Stop</th><th>School ID</th><th>Student</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr key={s.student_id}>
                  <td>{s.stop_name}</td>
                  <td>{s.student_number}</td>
                  <td>{s.first_name} {s.last_name}</td>
                  <td>
                    {s.board_time ? (
                      <span className={`badge ${s.drop_off_time ? 'badge-neutral' : 'badge-good'}`}>{s.drop_off_time ? `Dropped ${new Date(s.drop_off_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `Boarded ${new Date(s.board_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span>
                    ) : (
                      <span className="badge badge-neutral">Not boarded</span>
                    )}
                  </td>
                  <td>
                    {!s.board_time ? (
                      <button
                        className="btn btn-small"
                        disabled={busyStudent === s.student_id}
                        onClick={() => handleBoard(s.student_id, 'MANUAL')}
                      >
                        {busyStudent === s.student_id ? 'Saving…' : 'Manual check'}
                      </button>
                    ) : (!s.drop_off_time && s.trip_event_id) ? (
                      <button className="btn btn-small" disabled={busyDropoff === s.student_id} onClick={() => handleDropoff(s)}>{busyDropoff === s.student_id ? 'Saving…' : 'Drop off'}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="panel-actions">
            {gpsTracking ? (
              <button className="btn btn-small btn-danger" onClick={() => setGpsTracking(false)}>Stop live tracking</button>
            ) : (
              <button className="btn btn-small" onClick={() => setGpsTracking(true)}>Start live bus tracking</button>
            )}
            <button className="btn btn-small" disabled={gpsBusy} onClick={handleGpsPing}>{gpsBusy ? 'Updating location…' : 'Send demo GPS update'}</button>
            <button className="btn btn-small btn-danger" onClick={handleEndRoute}>End route (confirm bus empty)</button>
          </div>
        </section>

        <section className="panel">
          <h3>Report a delay</h3>
            <p className="muted">Delays over 10 minutes automatically excuse boarded students from tardy status and notify their parents.</p>
          <form onSubmit={handleReportDelay} className="stacked-form">
            <label>
              Reason
              <input value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="Traffic congestion" />
            </label>
            <label>
              Minutes delayed
              <input type="number" min="1" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} required />
            </label>
            <button className="btn btn-primary" type="submit">Report delay</button>
          </form>
        </section>
      </div>
    </div>
  );
}
