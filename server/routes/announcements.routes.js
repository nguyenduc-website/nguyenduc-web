'use strict';
const router = require('express').Router();
const { requireAuth, requireCsrf } = require('../middleware/auth');
const ann = require('../services/announcement.service');

router.get('/active', (req, res) => {
  if (req.user) {
    const list = ann.listForUser(req.user.id).filter(a => !a.read_at);
    return res.json({ success: true, data: list });
  }
  res.json({ success: true, data: ann.listActive() });
});

router.post('/:id/ack', requireAuth, requireCsrf, (req, res) => {
  ann.markRead(req.user.id, parseInt(req.params.id, 10));
  res.json({ success: true });
});

module.exports = router;