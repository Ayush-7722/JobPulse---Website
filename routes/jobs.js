const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken, requireAdmin, sanitize } = require('../middleware/auth');

// GET /api/jobs — List jobs with filters
router.get('/', (req, res) => {
  try {
    const { search, type, work_mode, category, experience_level, sort, page = 1, limit = 12 } = req.query;
    
    let where = ['j.is_active = 1'];
    let params = [];

    if (search) {
      where.push('(j.title LIKE ? OR j.company LIKE ? OR j.skills LIKE ? OR j.description LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (type) {
      where.push('j.type = ?');
      params.push(type);
    }

    if (work_mode) {
      where.push('j.work_mode = ?');
      params.push(work_mode);
    }

    if (category) {
      where.push('c.name = ?');
      params.push(category);
    }

    if (experience_level) {
      where.push('j.experience_level = ?');
      params.push(experience_level);
    }

    let orderBy = 'j.created_at DESC';
    if (sort === 'salary_high') orderBy = 'j.salary_max DESC';
    if (sort === 'salary_low') orderBy = 'j.salary_min ASC';
    if (sort === 'deadline') orderBy = 'j.deadline ASC';
    if (sort === 'newest') orderBy = 'j.created_at DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      WHERE ${where.join(' AND ')}
    `;
    const { total } = db.prepare(countQuery).get(...params);

    // Fetch jobs
    const query = `
      SELECT j.*, c.name as category_name, c.icon as category_icon
      FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const jobs = db.prepare(query).all(...params, parseInt(limit), offset);

    res.json({
      jobs,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / parseInt(limit)),
        total_jobs: total,
        per_page: parseInt(limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/featured — Featured jobs
router.get('/featured', (req, res) => {
  try {
    const jobs = db.prepare(`
      SELECT j.*, c.name as category_name, c.icon as category_icon
      FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      WHERE j.is_featured = 1 AND j.is_active = 1
      ORDER BY j.created_at DESC
      LIMIT 8
    `).all();
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/stats — Dashboard stats
router.get('/stats', (req, res) => {
  try {
    const totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE is_active = 1').get().count;
    const totalInternships = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE type = 'Internship' AND is_active = 1").get().count;
    const totalCompanies = db.prepare('SELECT COUNT(DISTINCT company) as count FROM jobs WHERE is_active = 1').get().count;
    const totalRemote = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE work_mode = 'Remote' AND is_active = 1").get().count;
    
    res.json({
      total_jobs: totalJobs,
      total_internships: totalInternships,
      total_companies: totalCompanies,
      total_remote: totalRemote
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id — Single job
router.get('/:id', (req, res) => {
  try {
    const job = db.prepare(`
      SELECT j.*, c.name as category_name, c.icon as category_icon
      FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      WHERE j.id = ?
    `).get(req.params.id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs — Create job (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    const title = sanitize(req.body.title);
    const company = sanitize(req.body.company);
    const company_logo = sanitize(req.body.company_logo) || '';
    const location = sanitize(req.body.location);
    const type = req.body.type;
    const work_mode = req.body.work_mode;
    const category_id = req.body.category_id;
    const salary_min = req.body.salary_min;
    const salary_max = req.body.salary_max;
    const currency = req.body.currency || 'USD';
    const description = sanitize(req.body.description);
    const requirements = sanitize(req.body.requirements);
    const responsibilities = sanitize(req.body.responsibilities);
    const skills = sanitize(req.body.skills);
    const experience_level = req.body.experience_level || 'Entry Level';
    const is_featured = req.body.is_featured || 0;
    const deadline = req.body.deadline;

    if (!title || !company || !location || !description) {
      return res.status(400).json({ error: 'Title, company, location, and description are required.' });
    }

    const result = db.prepare(`
      INSERT INTO jobs (title, company, company_logo, location, type, work_mode, category_id, salary_min, salary_max, currency, description, requirements, responsibilities, skills, experience_level, is_featured, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, company, company_logo, location, type, work_mode, category_id, salary_min, salary_max, currency, description, requirements, responsibilities, skills, experience_level, is_featured, deadline);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Job created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id — Delete job (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    db.prepare('UPDATE jobs SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
