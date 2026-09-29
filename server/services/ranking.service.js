'use strict';
const db = require('../database');

function touch(userId, points = 0, activity = 0) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO rankings (user_id, points, activity, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      points = points + excluded.points,
      activity = activity + excluded.activity,
      updated_at = excluded.updated_at
  `).run(userId, points, activity, now);
}

function top(limit = 50, offset = 0) {
  return db.prepare(`
    SELECT r.user_id, r.points, r.activity, u.username, u.display_name, u.avatar_url
    FROM rankings r JOIN users u ON u.id = r.user_id
    WHERE u.status = 'active'
    ORDER BY r.points DESC, r.activity DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

module.exports = { touch, top };