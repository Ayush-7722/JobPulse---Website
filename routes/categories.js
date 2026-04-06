const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/categories — List all categories with job counts
router.get('/', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.*, COUNT(j.id) as job_count
      FROM categories c
      LEFT JOIN jobs j ON c.id = j.category_id AND j.is_active = 1
      GROUP BY c.id
      ORDER BY job_count DESC
    `).all();

    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
