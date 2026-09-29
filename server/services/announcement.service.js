'use strict';
const db = require('../database');

function listActive() {
  return db.prepare(`
    SELECT id, title, body, kind, require_ack, created_at
    FROM announcements WHERE active = 1 ORDER BY id DESC
  `).all();
}

function listForUser(userId) {
  return db.prepare(`
    SELECT a.id, a.title, a.body, a.kind, a.require_ack, a.created_at,
           (SELECT read_at FROM announcement_reads WHERE user_id = ? AND announcement_id = a.id) AS read_at
    FROM announcements a WHERE a.active = 1 ORDER BY a.id DESC
  `).all(userId);
}

function markRead(userId, announcementId) {
  db.prepare(`
    INSERT INTO announcement_reads (user_id, announcement_id, read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, announcement_id) DO UPDATE SET read_at = excluded.read_at
  `).run(userId, announcementId, Date.now());
}

function create({ title, body, kind = 'ADMIN', requireAck = 1, createdBy }) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO announcements (title, body, kind, active, require_ack, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
  `).run(title, body, kind, requireAck ? 1 : 0, createdBy, now, now);
  return info.lastInsertRowid;
}

function update(id, patch) {
  const current = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  if (!current) return null;
  const next = {
    title: patch.title ?? current.title,
    body: patch.body ?? current.body,
    kind: patch.kind ?? current.kind,
    require_ack: patch.requireAck != null ? (patch.requireAck ? 1 : 0) : current.require_ack,
    active: patch.active != null ? (patch.active ? 1 : 0) : current.active,
  };
  db.prepare(`UPDATE announcements SET title=?, body=?, kind=?, require_ack=?, active=?, updated_at=? WHERE id=?`)
    .run(next.title, next.body, next.kind, next.require_ack, next.active, Date.now(), id);
  return id;
}

function remove(id) {
  db.prepare('UPDATE announcements SET active = 0, updated_at = ? WHERE id = ?').run(Date.now(), id);
}

module.exports = { listActive, listForUser, markRead, create, update, remove };