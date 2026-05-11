const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { cacheMiddleware } = require('../services/cache');

// GET /api/categories
router.get('/', cacheMiddleware(86400), (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.id, c.name, c.icon,
        (SELECT COUNT(*) FROM jobs WHERE category_id = c.id AND is_active = 1) as job_count
      FROM categories c
      ORDER BY c.name ASC
    `).all();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
