const express = require('express');
const router  = express.Router();
const { Job, Category } = require('../db/mongodb');
const { authenticateToken, requireAdmin, sanitize } = require('../middleware/auth');
const { cacheMiddleware } = require('../services/cache');

// ── GET /api/jobs ── List & search
router.get('/', async (req, res) => {
  try {
    const { search, type, work_mode, category, experience_level, sort, page = 1, limit = 12 } = req.query;
    const filter = { is_active: true };

    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { company:     { $regex: search, $options: 'i' } },
        { skills:      { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (type)             filter.type             = type;
    if (work_mode)        filter.work_mode        = work_mode;
    if (category)         filter.category_name    = category;
    if (experience_level) filter.experience_level = experience_level;

    let sortObj = { created_at: -1 };
    if (sort === 'salary_high') sortObj = { salary_max: -1 };
    if (sort === 'salary_low')  sortObj = { salary_min: 1  };
    if (sort === 'deadline')    sortObj = { deadline: 1    };

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const skip     = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Job.countDocuments(filter),
    ]);

    // Format for frontend (id field)
    const formatted = jobs.map(j => ({ ...j, id: j._id.toString() }));

    res.json({
      jobs: formatted,
      pagination: {
        current_page: pageNum,
        total_pages:  Math.ceil(total / limitNum),
        total_jobs:   total,
        per_page:     limitNum,
      }
    });
  } catch (err) {
    console.error('Jobs list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/featured ──
router.get('/featured', cacheMiddleware(300), async (req, res) => {
  try {
    const jobs = await Job.find({ is_featured: true, is_active: true })
      .sort({ created_at: -1 }).limit(8).lean();
    res.json({ jobs: jobs.map(j => ({ ...j, id: j._id.toString() })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/stats ──
router.get('/stats', cacheMiddleware(300), async (req, res) => {
  try {
    const [total_jobs, total_internships, total_remote] = await Promise.all([
      Job.countDocuments({ is_active: true }),
      Job.countDocuments({ is_active: true, type: 'Internship' }),
      Job.countDocuments({ is_active: true, work_mode: 'Remote' }),
    ]);
    // Count distinct companies
    const companies = await Job.distinct('company', { is_active: true });
    res.json({ total_jobs, total_internships, total_companies: companies.length, total_remote });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id ──
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job: { ...job, id: job._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/jobs — Create Job (admin only) ──
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, company, location, type, work_mode, description } = req.body;
    if (!title || !company || !location || !description) {
      return res.status(400).json({ error: 'Title, company, location, and description are required.' });
    }

    // Resolve category name
    let categoryId   = null;
    let categoryName = '';
    let categoryIcon = '';
    if (req.body.category_id) {
      const cat = await Category.findById(req.body.category_id);
      if (cat) { categoryId = cat._id; categoryName = cat.name; categoryIcon = cat.icon; }
    }

    const job = await Job.create({
      title: sanitize(title), company: sanitize(company),
      company_logo: sanitize(req.body.company_logo) || '',
      location: sanitize(location), type, work_mode,
      category: categoryId, category_name: categoryName, category_icon: categoryIcon,
      salary_min: req.body.salary_min, salary_max: req.body.salary_max,
      currency: req.body.currency || 'USD',
      description:      sanitize(description),
      requirements:     sanitize(req.body.requirements)     || '',
      responsibilities: sanitize(req.body.responsibilities) || '',
      skills:           sanitize(req.body.skills)           || '',
      experience_level: req.body.experience_level || 'Entry Level',
      is_featured: !!req.body.is_featured,
      deadline: req.body.deadline || null,
    });
    res.status(201).json({ id: job._id, message: 'Job created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/jobs/:id (admin only, soft delete) ──
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Job.findByIdAndUpdate(req.params.id, { is_active: false });
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
