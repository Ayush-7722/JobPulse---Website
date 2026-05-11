const jwt  = require('jsonwebtoken');
const db   = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

// ── Authenticate Token Middleware ──
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required. Please log in.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare(
      'SELECT id, full_name, email, role FROM users WHERE id = ? AND is_active = 1'
    ).get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User account not found or deactivated.' });
    req.user = { ...user, userId: user.id.toString() };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expired. Please log in again.' });
    return res.status(403).json({ error: 'Invalid authentication token.' });
  }
}

// ── Admin Only Middleware ──
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// ── Input Sanitizer ──
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

// ── Sanitize request body middleware ──
function sanitizeBody(req, res, next) {
  // Never sanitize passwords, tokens, or OTP codes as they may contain valid special characters
  const skipFields = ['password', 'confirm_password', 'current_password', 'new_password', 'otp', 'otp_code', 'verified_token'];
  
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string' && !skipFields.includes(key)) {
        req.body[key] = sanitize(req.body[key]);
      }
    }
  }
  next();
}

module.exports = { authenticateToken, requireAdmin, sanitize, sanitizeBody };
