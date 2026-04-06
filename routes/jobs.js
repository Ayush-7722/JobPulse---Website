const express = require('express');
const router  = express.Router();
const { fetchJobsFromSheet, getJobById } = require('../services/googleSheets');
const { authenticateToken, requireAdmin, sanitize } = require('../middleware/auth');
const { cacheMiddleware } = require('../services/cache');

// ── GET /api/jobs ── List & search from Google Sheets
router.get('/', async (req, res) => {
  try {
    const { search, type, work_mode, category, experience_level, sort, page = 1, limit = 12 } = req.query;
    
    let jobs = await fetchJobsFromSheet();

    // 1. Filter
    if (search) {
      const s = search.toLowerCase();
      jobs = jobs.filter(j => 
        j.title.toLowerCase().includes(s) || 
        j.company.toLowerCase().includes(s) || 
        j.skills.toLowerCase().includes(s) || 
        j.description.toLowerCase().includes(s)
      );
    }
    if (type)             jobs = jobs.filter(j => j.type === type);
    if (work_mode)        jobs = jobs.filter(j => j.work_mode === work_mode);
    if (category)         jobs = jobs.filter(j => j.category_name === category);
    if (experience_level) jobs = jobs.filter(j => j.experience_level === experience_level);

    // 2. Sort
    if (sort === 'salary_high') {
      jobs.sort((a, b) => (b.salary_max || 0) - (a.salary_max || 0));
    } else if (sort === 'salary_low') {
      jobs.sort((a, b) => (a.salary_min || 0) - (b.salary_min || 0));
    } else if (sort === 'deadline') {
      jobs.sort((a, b) => new Date(a.deadline || '9999') - new Date(b.deadline || '9999'));
    } else {
      // Default: Newest first (using index as a proxy for 'newest' if no date provided)
      // Since Google Sheets usually adds new entries at the bottom, we might want to reverse it
      // or use a 'Date Posted' column if it exists.
    }

    // 3. Pagination
    const total = jobs.length;
    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const skip     = (pageNum - 1) * limitNum;
    const paginatedJobs = jobs.slice(skip, skip + limitNum);

    res.json({
      jobs: paginatedJobs.map(j => ({ ...j, id: j._id })),
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
    const allJobs = await fetchJobsFromSheet();
    const featured = allJobs.filter(j => j.is_featured).slice(0, 8);
    res.json({ jobs: featured.map(j => ({ ...j, id: j._id })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/stats ──
router.get('/stats', cacheMiddleware(300), async (req, res) => {
  try {
    const allJobs = await fetchJobsFromSheet();
    const total_jobs = allJobs.length;
    const total_internships = allJobs.filter(j => j.type === 'Internship').length;
    const total_remote = allJobs.filter(j => j.work_mode === 'Remote').length;
    const companies = [...new Set(allJobs.map(j => j.company))];

    res.json({ 
      total_jobs, 
      total_internships, 
      total_companies: companies.length, 
      total_remote 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/jobs/:id ──
router.get('/:id', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job: { ...job, id: job._id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Note: POST and DELETE for admin are disabled for Google Sheets sync
// In a real app, you might use the Google Sheets API write capability.

module.exports = router;
