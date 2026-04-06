const express  = require('express');
const router   = express.Router();
const { Category } = require('../db/mongodb');

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
