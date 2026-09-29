'use strict';
const router = require('express').Router();
const db = require('../database');

router.get('/public', (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN ('site.name','site.maintenance')`).all();
  const obj = {};
  rows.forEach(r => obj[r.key] = r.value);
  res.json({ success: true, data: obj });
});

module.exports = router;