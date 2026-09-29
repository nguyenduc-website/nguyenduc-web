'use strict';
const router = require('express').Router();
const db = require('../database');

router.get('/', (req, res) => {
  let dbOk = false;
  try { db.prepare('SELECT 1').get(); dbOk = true; } catch {}
  res.json({
    success: true,
    data: {
      status: 'ok',
      db: dbOk ? 'up' : 'down',
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    },
  });
});

module.exports = router;