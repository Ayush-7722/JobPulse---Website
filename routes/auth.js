const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { User, OtpVerification } = require('../db/mongodb');
const { authenticateToken, sanitize } = require('../middleware/auth');

const JWT_SECRET    = process.env.JWT_SECRET    || 'fallback_secret_change_me';
const JWT_EXPIRES_IN= process.env.JWT_EXPIRES_IN|| '7d';
const SALT_ROUNDS   = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validatePassword(password) {
  const e = [];
  if (password.length < 8)           e.push('at least 8 characters');
  if (!/[A-Z]/.test(password))       e.push('one uppercase letter');
  if (!/[a-z]/.test(password))       e.push('one lowercase letter');
  if (!/[0-9]/.test(password))       e.push('one number');
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) e.push('one special character');
  return e;
}
function generateToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── POST /api/auth/send-otp ──
router.post('/send-otp', async (req, res) => {
  try {
    const email = sanitize(req.body.email)?.toLowerCase();
    const name  = sanitize(req.body.name) || 'User';
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await OtpVerification.countDocuments({ email, created_at: { $gt: oneHourAgo } });
    if (recentCount >= 3) return res.status(429).json({ error: 'Too many OTP requests. Please wait an hour.' });

    await OtpVerification.updateMany({ email, is_used: false }, { $set: { is_used: true } });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await OtpVerification.create({ email, name, otp_code: otp, expires_at: expiresAt });

    const { sendOTPEmail } = require('../services/email');
    const result = await sendOTPEmail(email, name, otp);

    if (result.sent) return res.json({ message: `Verification code sent to ${email}`, email_sent: true });
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Email service not configured. Set SMTP_USER and SMTP_PASS.' });
    }
    return res.json({ message: 'OTP generated (dev mode)', email_sent: false, dev_otp: otp });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// ── POST /api/auth/verify-otp ──
router.post('/verify-otp', async (req, res) => {
  try {
    const email = sanitize(req.body.email)?.toLowerCase();
    const otp   = sanitize(req.body.otp)?.replace(/\s/g, '');
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'OTP must be a 6-digit number.' });

    const record = await OtpVerification.findOne({ email, is_used: false }).sort({ created_at: -1 });
    if (!record) return res.status(400).json({ error: 'No pending OTP. Please request a new one.' });
    if (Date.now() > record.expires_at) {
      await OtpVerification.findByIdAndUpdate(record._id, { is_used: true });
      return res.status(400).json({ error: 'OTP expired. Please request a new code.' });
    }

    await OtpVerification.findByIdAndUpdate(record._id, { $inc: { attempts: 1 } });
    const updated = await OtpVerification.findById(record._id);
    if (updated.attempts > 5) {
      await OtpVerification.findByIdAndUpdate(record._id, { is_used: true });
      return res.status(400).json({ error: 'Too many attempts. Please request a new OTP.' });
    }

    if (record.otp_code !== otp) {
      const remaining = 5 - updated.attempts;
      return res.status(400).json({ error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
    }

    await OtpVerification.findByIdAndUpdate(record._id, { is_used: true });
    const verifiedToken = jwt.sign(
      { email, name: record.name, verified: true, purpose: 'registration' },
      JWT_SECRET, { expiresIn: '15m' }
    );
    res.json({ message: 'Email verified successfully!', verified: true, verified_token: verifiedToken });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'OTP verification failed. Please try again.' });
  }
});

// ── POST /api/auth/register ──
router.post('/register', async (req, res) => {
  try {
    const { verified_token, password, phone } = req.body;
    let verified;
    try { verified = jwt.verify(verified_token, JWT_SECRET); }
    catch { return res.status(400).json({ error: 'Email verification expired. Please verify your email again.' }); }

    if (!verified.verified || verified.purpose !== 'registration') {
      return res.status(400).json({ error: 'Invalid verification token.' });
    }

    const { email, name: full_name } = verified;
    if (!password) return res.status(400).json({ error: 'Password is required.' });

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) return res.status(400).json({ error: `Password must contain: ${passwordErrors.join(', ')}.` });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
    const user = await User.create({
      full_name, email: email.toLowerCase(), password_hash,
      phone: sanitize(phone) || null, role: 'user'
    });

    const token = generateToken(user);
    res.status(201).json({
      message: 'Account created successfully! Welcome to JobPulse 🎉',
      token,
      user: { id: user._id, full_name: user.full_name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', async (req, res) => {
  try {
    const email    = sanitize(req.body.email)?.toLowerCase();
    const password = req.body.password;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user) {
      console.warn(`[Auth] Login attempt failed: User not found for email ${email}`);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.is_active) return res.status(403).json({ error: 'This account has been deactivated. Please contact support.' });

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      console.warn(`[Auth] Login attempt failed: Password mismatch for email ${email}`);
      user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
      if (user.failed_login_attempts >= 5) {
        user.is_active = false;
        await user.save();
        return res.status(403).json({ error: 'Account locked due to too many failed attempts. Please contact support.' });
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset on successful login
    user.failed_login_attempts = 0;
    await user.save();

    const token = generateToken(user);
    res.json({
      message: 'Login successful!',
      token,
      user: { id: user._id, full_name: user.full_name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ──
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password_hash');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/profile ──
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const fields = ['full_name', 'phone', 'address', 'bio', 'current_job_title', 'resume_url', 'linkedin_url', 'portfolio_url'];
    
    fields.forEach(field => {
      // Intentionally omitting empty strings / undefined to avoid overwriting with null unless explicitly sent
      if (req.body[field] !== undefined) {
        user[field] = sanitize(req.body[field]);
      }
    });

    await user.save();
    
    // Convert to object cleanly invoking getters
    const userObj = user.toObject();
    delete userObj.password_hash;
    res.json({ message: 'Profile updated dynamically.', user: userObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/auth/password ──
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await User.findById(req.user.userId);
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const errs = validatePassword(new_password);
    if (errs.length > 0) return res.status(400).json({ error: `Password must contain: ${errs.join(', ')}.` });
    user.password_hash = bcrypt.hashSync(new_password, SALT_ROUNDS);
    await user.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
