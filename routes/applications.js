const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db/database');
const { authenticateToken, sanitize } = require('../middleware/auth');

// Configure multer for resume uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Sanitize original filename to prevent path traversal
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, 'resume-' + uniqueSuffix + safeExt);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  // Also verify MIME type
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowedTypes.includes(ext) && allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// POST /api/applications — Submit application (requires auth)
router.post('/', authenticateToken, upload.single('resume'), (req, res) => {
  try {
    const { job_id, cover_letter, linkedin_url, portfolio_url } = req.body;
    const phone = sanitize(req.body.phone) || null;

    if (!job_id) {
      return res.status(400).json({ error: 'Job ID is required.' });
    }

    // Use authenticated user's info
    const full_name = req.user.full_name;
    const email = req.user.email;

    // Check if job exists
    const job = db.prepare('SELECT id, title, company FROM jobs WHERE id = ? AND is_active = 1').get(job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or no longer active.' });
    }

    // Check for duplicate application by user
    const existing = db.prepare(
      'SELECT id FROM applications WHERE job_id = ? AND user_id = ?'
    ).get(job_id, req.user.id);
    if (existing) {
      return res.status(409).json({ error: 'You have already applied for this position.' });
    }

    const resume_path = req.file ? `/uploads/${req.file.filename}` : null;

    const result = db.prepare(`
      INSERT INTO applications (job_id, user_id, full_name, email, phone, resume_path, cover_letter, linkedin_url, portfolio_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job_id, req.user.id, full_name, email,
      phone, resume_path,
      sanitize(cover_letter) || null,
      sanitize(linkedin_url) || null,
      sanitize(portfolio_url) || null
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      message: `Application submitted successfully for ${job.title} at ${job.company}!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/my — Get current user's applications
router.get('/my', authenticateToken, (req, res) => {
  try {
    const applications = db.prepare(`
      SELECT a.id, a.status, a.created_at, j.title as job_title, j.company as job_company, j.location as job_location
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);

    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications — List all applications (admin only)
router.get('/', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const applications = db.prepare(`
      SELECT a.*, j.title as job_title, j.company as job_company
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      ORDER BY a.created_at DESC
    `).all();

    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
