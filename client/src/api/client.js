const API_URL = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('infrashield_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
  login: (login, password, verification = {}) => request('/auth/login', { method: 'POST', body: { login, password, ...verification } }),
  requestEmailCode: (login) => request('/auth/request-email-code', { method: 'POST', body: { login } }),
  verifyEmail: (login, code) => request('/auth/verify-email', { method: 'POST', body: { login, code } }),
  changePassword: (token, currentPassword, newPassword) => request('/auth/change-password', { method: 'POST', body: { token, current_password: currentPassword, new_password: newPassword } }),
  setupTotp: (token) => request('/auth/totp/setup', { method: 'POST', body: { token } }),
  verifyTotpSetup: (token, otp) => request('/auth/totp/verify', { method: 'POST', body: { token, otp } }),
  driverDashboard: (driverId) => request(`/dashboards/driver/${driverId}`),
  schoolDashboard: (schoolId) => request(`/dashboards/school/${schoolId}`),
  parentDashboard: (parentId) => request(`/dashboards/parent/${parentId}`),
  districtDashboard: (districtId) => request(`/dashboards/district/${districtId}`),
  teacherDashboard: (teacherId) => request(`/dashboards/teacher/${teacherId}`),
  countyDashboard: (countyId) => request(`/dashboards/county/${countyId}`),
  boardStudent: (payload) => request('/attendance/board', { method: 'POST', body: payload }),
  dropoffStudent: (tripEventId) => request(`/attendance/${tripEventId}/dropoff`, { method: 'POST' }),
  endRoute: (busId, tripId) => request(`/attendance/bus/${busId}/end-route`, { method: 'POST', body: { trip_id: tripId } }),
  reportDelay: (payload) => request('/delays', { method: 'POST', body: payload }),
  students: () => request('/students'),
  activeAlerts: () => request('/alerts/active'),
  createAlert: (payload) => request('/alerts', { method: 'POST', body: payload }),
  resolveAlert: (alertId) => request(`/alerts/${alertId}/resolve`, { method: 'POST' }),
  driverAvailability: () => request('/scheduling/availability'),
  setDriverAvailability: (driverId, payload) => request(`/scheduling/availability/${driverId}`, { method: 'POST', body: payload }),
  assignSubstitute: (payload) => request('/scheduling/substitute', { method: 'POST', body: payload }),
  gpsPing: (payload) => request('/gps/ping', { method: 'POST', body: payload }),
  studentRoute: (studentId, direction = 'AFTERNOON') => request(`/gps/student/${studentId}/route?direction=${direction}`),
  messageInbox: () => request('/family/messages/inbox'),
  studentMessages: (studentId, teacherId) => request(`/family/messages/student/${studentId}${teacherId ? `?teacher_id=${teacherId}` : ''}`),
  sendStudentMessage: (studentId, payload) => request(`/family/messages/student/${studentId}`, { method: 'POST', body: payload }),
  markClassAttendance: (studentId, payload) => request(`/family/class-attendance/${studentId}`, { method: 'POST', body: payload }),
  setSmsPreference: (enabled) => request('/family/sms-preference', { method: 'POST', body: { enabled } }),
};

export { getToken };
