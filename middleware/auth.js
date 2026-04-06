const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

// ── Authenticate Token Middleware ──
// Verifies the JWT and attaches user to req.user
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists and is active
    const user = db.prepare(
      'SELECT id, full_name, email, role FROM users WHERE id = ? AND is_active = 1'
    ).get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User account not found or deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(403).json({ error: 'Invalid authentication token.' });
  }
}

// ── Optional Auth Middleware ──
// Attaches user if token present, but doesn't require it
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare(
        'SELECT id, full_name, email, role FROM users WHERE id = ? AND is_active = 1'
      ).get(decoded.userId);
      if (user) req.user = user;
    } catch (err) {
      // Token invalid — just continue without user
    }
  }

  next();
}

// ── Admin Only Middleware ──
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ── Input Sanitizer ──
// Strips HTML tags and trims whitespace to prevent XSS
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '')   // Remove HTML tags
    .replace(/[<>]/g, '')       // Remove stray angle brackets
    .trim();
}

// ── Sanitize request body middleware ──
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitize(req.body[key]);
      }
    }
  }
  next();
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  sanitize,
  sanitizeBody,
};
