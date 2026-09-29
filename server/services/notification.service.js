'use strict';
const db = require('../database');

function create(userId, { kind = 'SYSTEM', title, body = null, link = null }) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO notifications (user_id, kind, title, body, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, kind, title, body, link, now);
  return info.lastInsertRowid;
}

function list(userId, limit = 30, offset = 0) {
  return db.prepare(`
    SELECT id, kind, title, body, link, read_at, created_at
    FROM notifications WHERE user_id = ?
    ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function unreadCount(userId) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId);
  return row.c;
}

function markRead(userId, id) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL')
    .run(Date.now(), userId, id);
}

function markAllRead(userId) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(Date.now(), userId);
}

module.exports = { create, list, unreadCount, markRead, markAllRead };