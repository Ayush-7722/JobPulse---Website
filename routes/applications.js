const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { Job, Application } = require('../db/mongodb');
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
router.post('/', authenticateToken, upload.single('resume'), async (req, res) => {
  try {
    const { job_id, cover_letter, linkedin_url, portfolio_url } = req.body;
    if (!job_id) return res.status(400).json({ error: 'Job ID is required.' });

    const job = await Job.findOne({ _id: job_id, is_active: true });
    if (!job) return res.status(404).json({ error: 'Job not found or no longer active.' });

    const existing = await Application.findOne({ job: job_id, user: req.user.userId });
    if (existing) return res.status(409).json({ error: 'You have already applied for this position.' });

    const resume_path = req.file ? `/uploads/${req.file.filename}` : null;
    const application = await Application.create({
      job:           job_id,
      user:          req.user.userId,
      full_name:     req.user.full_name,
      email:         req.user.email,
      phone:         sanitize(req.body.phone) || null,
      resume_path,
      cover_letter:  sanitize(cover_letter)  || null,
      linkedin_url:  sanitize(linkedin_url)  || null,
      portfolio_url: sanitize(portfolio_url) || null,
    });

    res.status(201).json({
      id: application._id,
      message: `Application submitted for ${job.title} at ${job.company}!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/applications/my ──
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const applications = await Application
      .find({ user: req.user.userId })
      .populate('job', 'title company location')
      .sort({ created_at: -1 })
      .lean();

    const formatted = applications.map(a => ({
      id:           a._id,
      status:       a.status,
      created_at:   a.created_at,
      job_title:    a.job?.title    || '',
      job_company:  a.job?.company  || '',
      job_location: a.job?.location || '',
    }));
    res.json({ applications: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/applications (admin only) ──
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    const applications = await Application
      .find()
      .populate('job', 'title company')
      .populate('user', 'full_name email')
      .sort({ created_at: -1 })
      .lean();
    res.json({ applications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/applications/:id/status (admin) ──
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    const { status } = req.body;
    const valid = ['pending','reviewed','shortlisted','rejected','hired'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    await Application.findByIdAndUpdate(req.params.id, { status });
    res.json({ message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
