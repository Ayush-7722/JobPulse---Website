const express  = require('express');
const router   = express.Router();
const { Category } = require('../db/mongodb');
const { cacheMiddleware } = require('../services/cache');

// GET /api/categories
router.get('/', cacheMiddleware(86400), async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
