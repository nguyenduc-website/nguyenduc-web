'use strict';
const router = require('express').Router();
const { z } = require('zod');
const db = require('../database');
const { requireAuth, requireCsrf } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const auth = require('../services/auth.service');
const ranking = require('../services/ranking.service');

router.get('/me', requireAuth, (req, res) => {
  const r = db.prepare('SELECT points, activity FROM rankings WHERE user_id = ?').get(req.user.id);
  res.json({
    success: true,
    data: {
      user: auth.sanitizeUser(req.user),
      ranking: r || { points: 0, activity: 0 },
    },
  });
});

const profileSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
});

router.patch('/me', requireAuth, requireCsrf, validate(profileSchema), (req, res) => {
  const { displayName, avatarUrl } = req.validated;
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  db.prepare('UPDATE users SET display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
    .run(
      displayName ?? current.display_name,
      avatarUrl || current.avatar_url,
      Date.now(),
      req.user.id
    );
  ranking.touch(req.user.id, 0, 1);
  res.json({ success: true, message: 'Cập nhật hồ sơ thành công' });
});

module.exports = router;