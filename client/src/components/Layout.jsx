import React from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import InstallAppButton from './InstallAppButton.jsx';
import AccountSecurity from './AccountSecurity.jsx';

const ROLE_LABELS = {
  driver: 'Driver',
  school_admin: 'School Attendance Office',
  district_admin: 'District Command Center',
  parent: 'Parent',
  teacher: 'Teacher',
  county_admin: 'County Command Center',
};

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark">IS</span>
          <div>
            <div className="brand-name">InfraShield</div>
            <div className="brand-sub">Smart Transportation &amp; Attendance</div>
          </div>
        </div>
        {user && (
          <div className="topbar-user">
            <div className="topbar-user-info">
              <span className="topbar-role">{ROLE_LABELS[user.role] || user.role}</span>
              <span className="topbar-username">{user.username}</span>
            </div>
            <div className="topbar-actions">
              <AccountSecurity />
              <InstallAppButton compact />
              <button className="btn btn-ghost" onClick={logout}>Sign out</button>
            </div>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
