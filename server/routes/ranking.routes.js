'use strict';
const router = require('express').Router();
const ranking = require('../services/ranking.service');

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  res.json({ success: true, data: ranking.top(limit, offset) });
});

module.exports = router;