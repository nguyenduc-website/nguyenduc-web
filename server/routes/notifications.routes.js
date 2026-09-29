'use strict';
const router = require('express').Router();
const { requireAuth, requireCsrf } = require('../middleware/auth');
const notif = require('../services/notification.service');

router.use(requireAuth);

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  res.json({ success: true, data: { items: notif.list(req.user.id, limit, offset), unread: notif.unreadCount(req.user.id) } });
});

router.post('/:id/read', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  notif.markRead(req.user.id, id);
  res.json({ success: true });
});

router.post('/read-all', requireCsrf, (req, res) => {
  notif.markAllRead(req.user.id);
  res.json({ success: true });
});

module.exports = router;