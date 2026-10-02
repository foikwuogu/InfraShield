import React, { useState } from 'react';
import { api, getToken } from '../api/client.js';

export default function AccountSecurity() {
  const [setup, setSetup] = useState(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function beginSetup() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSetup(await api.setupTotp(getToken()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function enableTotp(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.verifyTotpSetup(getToken(), otp);
      setSetup(null);
      setOtp('');
      setNotice('Authenticator-app sign-in is enabled. Use its six-digit code at your next sign-in.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="account-security">
      <summary>Account security</summary>
      <div className="account-security-content">
        <p className="muted small">Add this account to an authenticator app to use time-based one-time passwords (TOTP) instead of emailed sign-in codes.</p>
        {!setup && <button className="btn btn-small" type="button" disabled={busy} onClick={beginSetup}>{busy ? 'Preparing…' : 'Set up authenticator app'}</button>}
        {setup && (
          <form className="stacked-form" onSubmit={enableTotp}>
            <p>In your authenticator app, add an account using this setup key:</p>
            <code className="totp-secret">{setup.secret}</code>
            <label>Or copy this otpauth link<input readOnly value={setup.otpauth_url} onFocus={(event) => event.target.select()} /></label>
            <label>6-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} required /></label>
            <button className="btn btn-primary" type="submit" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Verify and enable'}</button>
          </form>
        )}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
      </div>
    </details>
  );
}
