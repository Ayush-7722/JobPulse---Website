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

// ── POST /api/auth/send-otp ──
// Step 1: User enters name + email → sends 6-digit OTP to their email
router.post('/send-otp', async (req, res) => {
  try {
    const email = sanitize(req.body.email)?.toLowerCase();
    const name  = sanitize(req.body.name)  || 'User';

    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    // Check if email already registered
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });

    // Rate limit: max 3 OTP requests per email per hour
    const recentCount = db.prepare(
      "SELECT COUNT(*) as c FROM otp_verifications WHERE email = ? AND created_at > datetime('now', '-1 hour')"
    ).get(email);
    if (recentCount.c >= 3) {
      return res.status(429).json({ error: 'Too many OTP requests. Please wait an hour before trying again.' });
    }

    // Invalidate any previous unused OTPs for this email
    db.prepare("UPDATE otp_verifications SET is_used = 1 WHERE email = ? AND is_used = 0").run(email);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    db.prepare(
      'INSERT INTO otp_verifications (email, name, otp_code, expires_at) VALUES (?, ?, ?, ?)'
    ).run(email, name, otp, expiresAt);

    // Send OTP email
    const { sendOTPEmail } = require('../services/email');
    const result = await sendOTPEmail(email, name, otp);

    if (result.sent) {
      return res.json({ message: `Verification code sent to ${email}`, email_sent: true });
    } else {
      // SMTP not configured — return error for production
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({
          error: 'Email service not configured. Please contact the administrator.',
          config_hint: 'Set SMTP_USER and SMTP_PASS environment variables.'
        });
      }
      // Development fallback: return OTP for testing
      return res.json({
        message: `OTP generated (dev mode — email not sent)`,
        email_sent: false,
        dev_otp: otp, // ← only visible in dev; remove in production
      });
    }
  } catch (err) {
    console.error('Send OTP error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// ── POST /api/auth/verify-otp ──
// Step 2: User submits the OTP received in email
router.post('/verify-otp', (req, res) => {
  try {
    const email = sanitize(req.body.email)?.toLowerCase();
    const otp   = sanitize(req.body.otp)?.replace(/\s/g, '');

    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'OTP must be a 6-digit number.' });

    // Find latest unused OTP for this email
    const record = db.prepare(
      'SELECT * FROM otp_verifications WHERE email = ? AND is_used = 0 ORDER BY created_at DESC LIMIT 1'
    ).get(email);

    if (!record) {
      return res.status(400).json({ error: 'No pending OTP for this email. Please request a new one.' });
    }

    // Check expiry
    if (Date.now() > record.expires_at) {
      db.prepare('UPDATE otp_verifications SET is_used = 1 WHERE id = ?').run(record.id);
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    // Track attempts (max 5)
    db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
    const updated = db.prepare('SELECT attempts FROM otp_verifications WHERE id = ?').get(record.id);
    if (updated.attempts > 5) {
      db.prepare('UPDATE otp_verifications SET is_used = 1 WHERE id = ?').run(record.id);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    // Verify OTP
    if (record.otp_code !== otp) {
      const remaining = 5 - updated.attempts;
      return res.status(400).json({ error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
    }

    // ✅ OTP is valid — mark as used
    db.prepare('UPDATE otp_verifications SET is_used = 1 WHERE id = ?').run(record.id);

    // Issue a short-lived "email verified" token (valid 15 min — just for registration)
    const verifiedToken = jwt.sign(
      { email, name: record.name, verified: true, purpose: 'registration' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      message: 'Email verified successfully!',
      verified: true,
      verified_token: verifiedToken,
    });
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    res.status(500).json({ error: 'OTP verification failed. Please try again.' });
  }
});

// ── POST /api/auth/register ──
// Step 3: Create account using the verified_token from step 2
router.post('/register', (req, res) => {
  try {
    const { verified_token, password, phone } = req.body;

    // Validate the verified_token
    let verified;
    try {
      verified = jwt.verify(verified_token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Email verification expired. Please verify your email again.' });
    }

    if (!verified.verified || verified.purpose !== 'registration') {
      return res.status(400).json({ error: 'Invalid verification token.' });
    }

    const { email, name: full_name } = verified;
    const cleanPhone = sanitize(phone) || null;

    if (!password) return res.status(400).json({ error: 'Password is required.' });

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: `Password must contain: ${passwordErrors.join(', ')}.` });
    }

    // Check email not already taken (double-check)
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash and insert
    const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
    const result = db.prepare(
      "INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, 'user')"
    ).run(full_name, email.toLowerCase(), password_hash, cleanPhone);

    const user = { id: result.lastInsertRowid, full_name, email: email.toLowerCase(), role: 'user' };
    const token = generateToken(user);

    res.status(201).json({
      message: 'Account created successfully! Welcome to JobPulse 🎉',
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
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
