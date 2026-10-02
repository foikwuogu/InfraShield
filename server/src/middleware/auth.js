const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.auth_version !== 2 || payload.email_verified !== true) {
      return res.status(401).json({ error: 'Your account session is outdated or not verified. Sign in again after activating your account.' });
    }
    if (payload.password_change_required) {
      return res.status(403).json({ error: 'Change your temporary password before accessing this resource' });
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
