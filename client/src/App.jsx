import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import DriverDashboard from './pages/DriverDashboard.jsx';
import SchoolDashboard from './pages/SchoolDashboard.jsx';
import ParentDashboard from './pages/ParentDashboard.jsx';
import DistrictDashboard from './pages/DistrictDashboard.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import CountyDashboard from './pages/CountyDashboard.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.password_change_required) return <Navigate to="/login" replace />;
  return children;
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.password_change_required) return <Navigate to="/login" replace />;
  const map = {
    driver: '/driver',
    school_admin: '/school',
    district_admin: '/district',
    parent: '/parent',
    teacher: '/teacher',
    county_admin: '/county',
  };
  return <Navigate to={map[user.role] || '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<RoleHome />} />
        <Route path="/driver" element={<RequireAuth><DriverDashboard /></RequireAuth>} />
        <Route path="/school" element={<RequireAuth><SchoolDashboard /></RequireAuth>} />
        <Route path="/parent" element={<RequireAuth><ParentDashboard /></RequireAuth>} />
        <Route path="/district" element={<RequireAuth><DistrictDashboard /></RequireAuth>} />
        <Route path="/teacher" element={<RequireAuth><TeacherDashboard /></RequireAuth>} />
        <Route path="/county" element={<RequireAuth><CountyDashboard /></RequireAuth>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
