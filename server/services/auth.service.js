'use strict';
const bcrypt = require('bcryptjs');
const db = require('../database');
const config = require('../config');
const { randomToken, sha256 } = require('../security/crypto');

const SALT = 12;

async function hashPassword(pw) { return bcrypt.hash(pw, SALT); }
async function verifyPassword(pw, hash) { return bcrypt.compare(pw, hash); }

function createSession(userId, req) {
  const id = randomToken(32);
  const csrf = randomToken(24);
  const now = Date.now();
  db.prepare(`INSERT INTO sessions (id, user_id, csrf_token, ip, user_agent, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, csrf, req.ip, req.headers['user-agent'] || '', now, now + config.sessionTtlMs);
  return { id, csrf };
}

function findSession(sessionId) {
  if (!sessionId) return null;
  const s = db.prepare(`SELECT * FROM sessions WHERE id = ? AND revoked = 0`).get(sessionId);
  if (!s) return null;
  if (s.expires_at < Date.now()) return null;
  return s;
}

function revokeSession(id) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(id);
}

function revokeAllForUser(userId, exceptId = null) {
  if (exceptId) {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id != ?').run(userId, exceptId);
  } else {
    db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?').run(userId);
  }
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    role: u.role,
    status: u.status,
    package: u.package,
    packageExpiresAt: u.package_expires_at,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    mustChangePassword: !!u.must_change_password,
  };
}

module.exports = {
  hashPassword, verifyPassword, createSession, findSession,
  revokeSession, revokeAllForUser, sanitizeUser,
};