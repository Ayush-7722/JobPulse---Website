const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticateToken, sanitize } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePassword(password) {
  const e = [];
  if (password.length < 8) e.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) e.push('one uppercase letter');
  if (!/[a-z]/.test(password)) e.push('one lowercase letter');
  if (!/[0-9]/.test(password)) e.push('one number');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) e.push('one special character');
  return e;
}
function generateToken(user) {
  return jwt.sign(
    { userId: user.id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}


// ── POST /api/auth/register (Direct Email/Password Registration) ──
router.post('/register', (req, res) => {
  try {
    const { full_name, email, password, phone } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Name, Email and Password are required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: `Password must contain: ${passwordErrors.join(', ')}.` });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
    const result = db.prepare(
      'INSERT INTO users (full_name, email, password_hash, phone, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(sanitize(full_name), email.toLowerCase(), password_hash, sanitize(phone) || null, 'user');

    const user = { id: result.lastInsertRowid, full_name: sanitize(full_name), email: email.toLowerCase(), role: 'user' };
    const token = generateToken(user);
    res.status(201).json({
      message: 'Account created successfully! Welcome to JobPulse 🎉',
      token,
      user
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', (req, res) => {
  try {
    const email = sanitize(req.body.email)?.toLowerCase();
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!user) {
      console.warn(`[Auth] Login attempt failed: User not found for email ${email}`);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.is_active) return res.status(403).json({ error: 'This account has been deactivated. Please contact support.' });

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      console.warn(`[Auth] Login attempt failed: Password mismatch for email ${email}`);
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= 10) {
        db.prepare('UPDATE users SET failed_login_attempts = ?, is_active = 0 WHERE id = ?').run(attempts, user.id);
        return res.status(403).json({ error: 'Account locked due to too many failed attempts. Please contact support.' });
      }
      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset on successful login
    db.prepare('UPDATE users SET failed_login_attempts = 0, last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = generateToken(user);
    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ──
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, full_name, email, phone, role, is_active, created_at FROM users WHERE id = ?'
    ).get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/profile ──
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const full_name = sanitize(req.body.full_name) || user.full_name;
    const phone = req.body.phone !== undefined ? sanitize(req.body.phone) : user.phone;

    db.prepare('UPDATE users SET full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(full_name, phone, user.id);

    const updated = db.prepare(
      'SELECT id, full_name, email, phone, role, is_active, created_at FROM users WHERE id = ?'
    ).get(user.id);

    res.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/password ──
router.put('/password', authenticateToken, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const errs = validatePassword(new_password);
    if (errs.length > 0) return res.status(400).json({ error: `Password must contain: ${errs.join(', ')}.` });
    const hash = bcrypt.hashSync(new_password, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, user.id);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
