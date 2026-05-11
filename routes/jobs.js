const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken, requireAdmin, sanitize } = require('../middleware/auth');
const { cacheMiddleware } = require('../services/cache');

// ── GET /api/jobs ── List & search jobs from SQLite
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
    if (type) { where.push('j.type = ?'); params.push(type); }
    if (work_mode) { where.push('j.work_mode = ?'); params.push(work_mode); }
    if (category) { where.push('c.name = ?'); params.push(category); }
    if (experience_level) { where.push('j.experience_level = ?'); params.push(experience_level); }

    let orderBy = 'j.created_at DESC';
    if (sort === 'salary_high') orderBy = 'j.salary_max DESC';
    else if (sort === 'salary_low') orderBy = 'j.salary_min ASC';
    else if (sort === 'deadline') orderBy = 'j.deadline ASC';

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Count total
    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      ${whereClause}
    `).get(...params);

    const total = countRow.total;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const jobs = db.prepare(`
      SELECT j.*, c.name as category_name, c.icon as category_icon
      FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      jobs: jobs.map(j => ({ ...j, id: j.id })),
      pagination: {
        current_page: pageNum,
        total_pages: Math.ceil(total / limitNum),
        total_jobs: total,
        per_page: limitNum,
      }
    });
  } catch (err) {
    console.error('Jobs list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/featured ──
router.get('/featured', cacheMiddleware(300), (req, res) => {
  try {
    const jobs = db.prepare(`
      SELECT j.*, c.name as category_name, c.icon as category_icon
      FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      WHERE j.is_active = 1 AND j.is_featured = 1
      ORDER BY j.created_at DESC
      LIMIT 8
    `).all();
    res.json({ jobs: jobs.map(j => ({ ...j, id: j.id })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/stats ──
router.get('/stats', cacheMiddleware(300), (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN type = 'Internship' THEN 1 ELSE 0 END) as total_internships,
        COUNT(DISTINCT company) as total_companies,
        SUM(CASE WHEN work_mode = 'Remote' THEN 1 ELSE 0 END) as total_remote
      FROM jobs
      WHERE is_active = 1
    `).get();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id ──
router.get('/:id', (req, res) => {
  try {
    const job = db.prepare(`
      SELECT j.*, c.name as category_name, c.icon as category_icon
      FROM jobs j
      LEFT JOIN categories c ON j.category_id = c.id
      WHERE j.id = ?
    `).get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job: { ...job, id: job.id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
