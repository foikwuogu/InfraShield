import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../api/client.js';
import { useAuth } from '../AuthContext.jsx';
import InstallAppButton from '../components/InstallAppButton.jsx';

const ROLE_FIELDS = {
  parent: { label: 'Student school ID', key: 'student_number', placeholder: 'For example: PB-2026-002004' },
  teacher: { label: 'Teacher staff ID', key: 'teacher_id', placeholder: 'For example: TCH101' },
  driver: { label: 'Driver employee ID', key: 'employee_id', placeholder: 'For example: PB-EMP-013' },
  school_admin: { label: 'School ID', key: 'organization_id', placeholder: 'For example: SCH001', admin: true },
  district_admin: { label: 'District ID', key: 'organization_id', placeholder: 'For example: DIST001', admin: true },
  county_admin: { label: 'County ID', key: 'organization_id', placeholder: 'For example: CNT001', admin: true },
};

export default function Login() {
  const { user, login, completePasswordChange } = useAuth();
  const navigate = useNavigate();
  const initialChange = Boolean(user?.password_change_required);
  const [mode, setMode] = useState('signin');
  const [step, setStep] = useState(initialChange ? 'change_password' : 'credentials');
  const [loginId, setLoginId] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [otp, setOtp] = useState('');
  const [authMethod, setAuthMethod] = useState('email');
  const [signup, setSignup] = useState({ username: '', email: '', role: 'parent', identity_code: '', invite_code: '' });
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupLogin, setSignupLogin] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const roleField = ROLE_FIELDS[signup.role];

  async function finishSignIn(result) {
    setEmailCode('');
    setOtp('');
    if (result.password_change_required) {
      setPendingPassword(password);
      setStep('change_password');
      setMessage('Your account has a generated temporary password. Choose a new password before entering the dashboard.');
      return;
    }
    navigate('/');
  }

  async function submitCredentials(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await login(loginId, password, authMethod === 'totp' ? { otp } : undefined);
      if (result.email_code_required) {
        setStep('login_code');
        setMessage(`${result.message}${result.development_code ? ` Development code: ${result.development_code}` : ''}`);
        return;
      }
      await finishSignIn(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitLoginCode(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await login(loginId, password, { verification_code: emailCode });
      await finishSignIn(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await api.signup({
        ...signup,
        email: signup.email.trim(),
        [roleField.key]: signup.identity_code,
      });
      setSignupLogin(result.email);
      setLoginId(result.email);
      setGeneratedPassword(result.development_temporary_password || '');
      setStep('verify_signup');
      setMessage(`${result.message}${result.development_code ? ` Development verification code: ${result.development_code}` : ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSignupVerification(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.verifyEmail(signupLogin, emailCode);
      setLoginId(signupLogin);
      if (generatedPassword) setPassword(generatedPassword);
      setEmailCode('');
      setMode('signin');
      setStep('credentials');
      setAuthMethod('email');
      setMessage('Email verified. Sign in using the temporary password sent to your email.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Choose a password with at least 12 characters.');
      return;
    }
    setBusy(true);
    try {
      await completePasswordChange(getToken(), pendingPassword || password, newPassword);
      setPassword('');
      setPendingPassword('');
      setMessage('Password updated. Opening your dashboard…');
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError('');
    setBusy(true);
    try {
      await api.requestEmailCode(step === 'verify_signup' ? signupLogin : loginId);
      setMessage('If the account is eligible, a fresh code has been sent. Check your email.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode) {
    setError('');
    setMessage('');
    setStep('credentials');
    setMode(nextMode);
  }

  return (
    <div className="login-screen">
      <div className="login-card auth-card">
        <div className="login-brand">
          <span className="brand-mark large">IS</span>
          <h1>InfraShield</h1>
          <p>Smart School Transportation &amp; Attendance System</p>
        </div>

        {step === 'credentials' && mode === 'signin' && (
          <>
            <div className="auth-mode-switch" role="tablist" aria-label="Account access">
              <button type="button" className="btn btn-small active" onClick={() => switchMode('signin')}>Sign in</button>
              <button type="button" className="btn btn-small" onClick={() => switchMode('signup')}>Create account</button>
            </div>
            <form onSubmit={submitCredentials} className="login-form">
              <label>Email or username<input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" required /></label>
              <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
              <fieldset className="auth-methods">
                <legend>Second step</legend>
                <label><input type="radio" name="auth-method" checked={authMethod === 'email'} onChange={() => setAuthMethod('email')} /> Email code</label>
                <label><input type="radio" name="auth-method" checked={authMethod === 'totp'} onChange={() => setAuthMethod('totp')} /> Authenticator app</label>
              </fieldset>
              {authMethod === 'totp' && <label>6-digit app code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required /></label>}
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              {message && <div className="alert alert-info" role="status">{message}</div>}
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            </form>
          </>
        )}

        {step === 'credentials' && mode === 'signup' && (
          <>
            <div className="auth-mode-switch" role="tablist" aria-label="Account access">
              <button type="button" className="btn btn-small" onClick={() => switchMode('signin')}>Sign in</button>
              <button type="button" className="btn btn-small active" onClick={() => switchMode('signup')}>Create account</button>
            </div>
            <form onSubmit={submitSignup} className="login-form">
              <label>Account type
                <select value={signup.role} onChange={(e) => setSignup({ ...signup, role: e.target.value, identity_code: '' })}>
                  <option value="parent">Parent / guardian</option><option value="teacher">Teacher</option><option value="driver">Driver</option>
                  <option value="school_admin">School administrator</option><option value="district_admin">District administrator</option><option value="county_admin">County administrator</option>
                </select>
              </label>
              <label>Username<input value={signup.username} onChange={(e) => setSignup({ ...signup, username: e.target.value })} autoComplete="username" required minLength={3} maxLength={100} /></label>
              <label>Registered email<input type="email" value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} autoComplete="email" required /></label>
              <label>{roleField.label}<input value={signup.identity_code} onChange={(e) => setSignup({ ...signup, identity_code: e.target.value })} placeholder={roleField.placeholder} required /></label>
              {roleField.admin && <label>District-issued invite code<input type="password" value={signup.invite_code} onChange={(e) => setSignup({ ...signup, invite_code: e.target.value })} autoComplete="off" required /></label>}
              {error && <div className="alert alert-error" role="alert">{error}</div>}
              {message && <div className="alert alert-info" role="status">{message}</div>}
              <p className="muted small">Your account must match an existing school, guardian, teacher, or employee record. A generated temporary password is emailed; you will change it after sign-in.</p>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
            </form>
          </>
        )}

        {(step === 'login_code' || step === 'verify_signup') && (
          <form onSubmit={step === 'login_code' ? submitLoginCode : submitSignupVerification} className="login-form">
            <h2>{step === 'login_code' ? 'Check your email' : 'Verify your email'}</h2>
            <p className="muted">Enter the six-digit code sent to your registered email address. Codes expire in 10 minutes.</p>
            {step === 'verify_signup' && generatedPassword && <div className="alert alert-info">Development temporary password (shown once): <strong>{generatedPassword}</strong></div>}
            {message && <div className="alert alert-info" role="status">{message}</div>}
            <label>6-digit email code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))} required /></label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy || emailCode.length !== 6}>{busy ? 'Verifying…' : step === 'login_code' ? 'Verify and sign in' : 'Verify email'}</button>
            <button className="btn btn-ghost auth-secondary" type="button" onClick={resendCode} disabled={busy}>Resend code</button>
            {step === 'login_code' && <button className="btn btn-ghost auth-secondary" type="button" onClick={() => { setStep('credentials'); setEmailCode(''); setError(''); }}>Back to sign in</button>}
          </form>
        )}

        {step === 'change_password' && (
          <form onSubmit={submitPasswordChange} className="login-form">
            <h2>Choose a new password</h2>
            <p className="muted">A new account starts with a generated temporary password. Replace it before accessing your dashboard.</p>
            <label>Temporary password<input type="password" value={pendingPassword || password} onChange={(e) => { setPendingPassword(e.target.value); setPassword(e.target.value); }} autoComplete="current-password" required /></label>
            <label>New password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={12} required /></label>
            <label>Confirm new password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} required /></label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {message && <div className="alert alert-info" role="status">{message}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Set password and continue'}</button>
          </form>
        )}

        {step === 'credentials' && mode === 'signin' && !initialChange && (
          <details className="login-demo">
            <summary className="login-demo-title">How account activation works</summary>
            <div className="login-demo-content">
              <ol className="login-demo-coverage">
                <li>Choose <strong>Create account</strong>; verify your registered email and student/staff ID.</li>
                <li>InfraShield generates a temporary password and emails it with a separate six-digit code.</li>
                <li>Verify the email, sign in, and choose your own password before the dashboard opens.</li>
                <li>After sign-in, open <strong>Account security</strong> to enable an authenticator app.</li>
              </ol>
              <p className="muted small">Local seeded accounts must also activate through sign-up. Local email codes are written to the API development terminal; production requires configured SMTP delivery.</p>
            </div>
          </details>
        )}

        <InstallAppButton />
      </div>
    </div>
  );
}
