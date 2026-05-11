const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const db      = require('../db/database');
const { authenticateToken, sanitize } = require('../middleware/auth');

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'resume-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const fileFilter = (req, file, cb) => {
  const allowedExts  = ['.pdf', '.doc', '.docx'];
  const allowedMimes = ['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ── POST /api/applications ──
router.post('/', authenticateToken, upload.single('resume'), (req, res) => {
  try {
    const { job_id, cover_letter, linkedin_url, portfolio_url } = req.body;
    if (!job_id) return res.status(400).json({ error: 'Job ID is required.' });

    // Check if job exists and is active
    const job = db.prepare('SELECT id, title, company FROM jobs WHERE id = ? AND is_active = 1').get(job_id);
    if (!job) return res.status(404).json({ error: 'Job not found or no longer active.' });

    // Check for duplicate application
    const existing = db.prepare('SELECT id FROM applications WHERE job_id = ? AND user_id = ?').get(job_id, req.user.userId);
    if (existing) return res.status(409).json({ error: 'You have already applied for this position.' });

    const resume_path = req.file ? `/uploads/${req.file.filename}` : null;
    const result = db.prepare(`
      INSERT INTO applications (job_id, user_id, full_name, email, phone, resume_path, cover_letter, linkedin_url, portfolio_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      job_id,
      req.user.userId,
      req.user.full_name,
      req.user.email,
      sanitize(req.body.phone) || null,
      resume_path,
      sanitize(cover_letter)  || null,
      sanitize(linkedin_url)  || null,
      sanitize(portfolio_url) || null,
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      message: `Application submitted for ${job.title} at ${job.company}!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/applications/my ──
router.get('/my', authenticateToken, (req, res) => {
  try {
    const applications = db.prepare(`
      SELECT a.id, a.status, a.created_at,
             j.title as job_title, j.company as job_company, j.location as job_location
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.userId);

    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/applications (admin only) ──
router.get('/', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    const applications = db.prepare(`
      SELECT a.*, j.title as job_title, j.company as job_company,
             u.full_name as user_name, u.email as user_email
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
    `).all();
    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/applications/:id/status (admin) ──
router.patch('/:id/status', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    const { status } = req.body;
    const valid = ['pending','reviewed','shortlisted','rejected','hired'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
