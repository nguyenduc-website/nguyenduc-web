'use strict';
const db = require('../database');

function upsert(userId, targetType, targetId, rating, comment = null) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO ratings (user_id, target_type, target_id, rating, comment, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, target_type, target_id)
    DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at
  `).run(userId, targetType, targetId, rating, comment, now, now);
}

function summary(targetType, targetId) {
  const row = db.prepare(`
    SELECT AVG(rating) AS avg, COUNT(*) AS count FROM ratings WHERE target_type = ? AND target_id = ?
  `).get(targetType, targetId);
  return { average: row.avg || 0, count: row.count };
}

function list(targetType, targetId, limit = 30) {
  return db.prepare(`
    SELECT r.rating, r.comment, r.created_at, u.display_name, u.username
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.target_type = ? AND r.target_id = ?
    ORDER BY r.id DESC LIMIT ?
  `).all(targetType, targetId, limit);
}

module.exports = { upsert, summary, list };