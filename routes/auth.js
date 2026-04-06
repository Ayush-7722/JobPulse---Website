const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticateToken, sanitize } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// ── Email validation ──
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Password strength validation ──
function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('one number');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('one special character');
  return errors;
}

// ── Generate JWT ──
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── POST /api/auth/register ──
router.post('/register', (req, res) => {
  try {
    const full_name = sanitize(req.body.full_name);
    const email = sanitize(req.body.email)?.toLowerCase();
    const password = req.body.password;
    const phone = sanitize(req.body.phone) || null;

    // Validation
    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (full_name.length < 2 || full_name.length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: `Password must contain: ${passwordErrors.join(', ')}.`
      });
    }

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);

    // Create user
    const result = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, phone, role)
      VALUES (?, ?, ?, ?, 'user')
    `).run(full_name, email, password_hash, phone);

    const user = {
      id: result.lastInsertRowid,
      full_name,
      email,
      role: 'user'
    };

    const token = generateToken(user);

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', (req, res) => {
  try {
    const email = sanitize(req.body.email)?.toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find user
    const user = db.prepare(
      'SELECT id, full_name, email, password_hash, role, is_active FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      // Use generic message to prevent email enumeration
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    // Verify password
    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      // Log failed attempt
      db.prepare('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(user.id);

      // Check if account should be locked (5 failed attempts)
      const updated = db.prepare('SELECT failed_login_attempts FROM users WHERE id = ?').get(user.id);
      if (updated.failed_login_attempts >= 5) {
        db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);
        return res.status(403).json({
          error: 'Account locked due to too many failed attempts. Please contact support.'
        });
      }

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset failed attempts on successful login
    db.prepare('UPDATE users SET failed_login_attempts = 0, last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = generateToken(user);

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me — Get current user profile ──
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, full_name, email, phone, role, created_at, last_login
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Get user's applications
    const applications = db.prepare(`
      SELECT a.id, a.status, a.created_at, j.title as job_title, j.company as job_company
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);

    res.json({ user, applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/profile — Update profile ──
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const full_name = sanitize(req.body.full_name);
    const phone = sanitize(req.body.phone) || null;

    if (full_name && (full_name.length < 2 || full_name.length > 100)) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
    }

    db.prepare('UPDATE users SET full_name = COALESCE(?, full_name), phone = ? WHERE id = ?')
      .run(full_name || null, phone, req.user.id);

    res.json({ message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/password — Change password ──
router.put('/password', authenticateToken, (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }

    const passwordErrors = validatePassword(new_password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: `New password must contain: ${passwordErrors.join(', ')}.`
      });
    }

    // Verify current password
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Hash and update
    const new_hash = bcrypt.hashSync(new_password, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(new_hash, req.user.id);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
