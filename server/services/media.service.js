'use strict';
const db = require('../database');
const path = require('path');
const fs = require('fs');
const config = require('../config');

function listByPackage(pkg, limit = 50, offset = 0) {
  return db.prepare(`
    SELECT id, name, version, image_url, file_url, package, description, price, downloads, created_at
    FROM media WHERE active = 1 AND package = ? ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(pkg, limit, offset);
}

function get(id) { return db.prepare('SELECT * FROM media WHERE id = ? AND active = 1').get(id); }

function create(data, createdBy) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO media (name, version, image_path, image_url, file_path, file_url, package, description, price, created_by, created_at, updated_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    data.name, data.version || '1.0',
    data.imagePath || null, data.imageUrl || null,
    data.filePath || null, data.fileUrl || null,
    data.package, data.description || null, data.price || 0,
    createdBy, now, now
  );
  return info.lastInsertRowid;
}

function incrementDownload(id) {
  db.prepare('UPDATE media SET downloads = downloads + 1 WHERE id = ?').run(id);
}

function hasAccess(user, mediaId) {
  const m = get(mediaId);
  if (!m) return { ok: false, reason: 'NOT_FOUND' };
  if (m.package === 'FREE') return { ok: true, media: m };

  if (!user) return { ok: false, reason: 'AUTH_REQUIRED', media: m };

  // ADMIN/MODERATOR luôn có quyền
  if (user.role === 'ADMIN' || user.role === 'MODERATOR') return { ok: true, media: m };

  // Media ACCESS explicit
  const acc = db.prepare('SELECT * FROM media_access WHERE user_id = ? AND media_id = ?').get(user.id, mediaId);
  if (acc) {
    if (!acc.expires_at || acc.expires_at > Date.now()) return { ok: true, media: m };
  }

  // Package check
  const rank = { FREE: 0, BASIC: 1, PREMIUM: 2 };
  if (rank[user.package] >= rank[m.package]) return { ok: true, media: m };

  return { ok: false, reason: 'UPGRADE_REQUIRED', media: m };
}

function grantAccess(userId, mediaId, expiresAt = null) {
  db.prepare(`
    INSERT INTO media_access (user_id, media_id, granted_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, media_id) DO UPDATE SET granted_at = excluded.granted_at, expires_at = excluded.expires_at
  `).run(userId, mediaId, Date.now(), expiresAt);
}

function safeUnlink(p) {
  if (!p) return;
  try {
    const abs = path.resolve(p);
    const allowed = path.resolve(process.cwd(), 'uploads');
    if (abs.startsWith(allowed) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {}
}

module.exports = { listByPackage, get, create, incrementDownload, hasAccess, grantAccess, safeUnlink };