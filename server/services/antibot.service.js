'use strict';
const crypto = require('crypto');
const db = require('../database');
const config = require('../config');
const { randomToken, hashIp, hashUa } = require('../security/crypto');

const DIFFICULTY = 3; // số hex 0 đứng đầu

function issueChallenge(req) {
  const id = randomToken(16);
  const nonce = randomToken(16);
  const now = Date.now();
  db.prepare(`INSERT INTO antibot_challenges (id, nonce, difficulty, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?)`)
    .run(id, nonce, DIFFICULTY, now, now + config.antibotChallengeTtlMs);
  return { id, nonce, difficulty: DIFFICULTY, expiresAt: now + config.antibotChallengeTtlMs };
}

function verifyChallenge(req, { id, solution, elapsedMs }) {
  const row = db.prepare('SELECT * FROM antibot_challenges WHERE id = ?').get(id);
  if (!row) return { ok: false, reason: 'CHALLENGE_NOT_FOUND' };
  if (row.solved_at) return { ok: false, reason: 'ALREADY_SOLVED' };
  if (row.expires_at < Date.now()) return { ok: false, reason: 'EXPIRED' };

  const hash = crypto.createHash('sha256').update(row.nonce + ':' + String(solution)).digest('hex');
  if (!hash.startsWith('0'.repeat(row.difficulty))) return { ok: false, reason: 'BAD_SOLUTION' };

  if (typeof elapsedMs !== 'number' || elapsedMs < 1500) return { ok: false, reason: 'TOO_FAST' };

  db.prepare('UPDATE antibot_challenges SET solved_at = ? WHERE id = ?').run(Date.now(), id);

  const vid = randomToken(24);
  const now = Date.now();
  db.prepare(`INSERT INTO antibot_verifications (id, ip_hash, ua_hash, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?)`)
    .run(vid, hashIp(req.ip), hashUa(req.headers['user-agent']), now, now + config.antibotTtlMs);

  return { ok: true, verificationId: vid, expiresAt: now + config.antibotTtlMs };
}

function isVerified(req) {
  const vid = req.cookies?.ngduc_ab;
  if (!vid) return false;
  const row = db.prepare('SELECT * FROM antibot_verifications WHERE id = ?').get(vid);
  if (!row) return false;
  if (row.revoked) return false;
  if (row.expires_at < Date.now()) return false;
  if (row.ip_hash !== hashIp(req.ip)) return false;
  if (row.ua_hash !== hashUa(req.headers['user-agent'])) return false;
  return true;
}

module.exports = { issueChallenge, verifyChallenge, isVerified };