'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { start, stop, makeClient, db } = require('./helpers');
const authSvc = require('../server/services/auth.service');

before(async () => { await start(); });
after(async () => { await stop(); });

async function verifyAntibot(client) {
  let r = await client.req('POST', '/api/antibot/challenge');
  const { id, nonce, difficulty } = r.body.data;
  let s = 0;
  const t = '0'.repeat(difficulty);
  while (s < 5_000_000) {
    const h = crypto.createHash('sha256').update(nonce + ':' + s).digest('hex');
    if (h.startsWith(t)) break;
    s++;
  }
  await client.req('POST', '/api/antibot/verify', { id, solution: s, elapsedMs: 2000 });
}

test('user cannot create media (requires MODERATOR)', async () => {
  const c = makeClient();
  const uniq = 'mu' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  const lr = await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  await verifyAntibot(c);

  const r = await c.req('POST', '/api/media/create', {
    name: 'X', version: '1.0', package: 'FREE',
  }, { 'X-CSRF-Token': lr.body.data.csrfToken });

  assert.strictEqual(r.status, 403);
});

test('FREE media is accessible to any logged in user with antibot', async () => {
  const now = Date.now();
  const hash = await authSvc.hashPassword('StrongPass123!');
  db.prepare(`INSERT INTO users (username, password_hash, role, status, package, created_at, updated_at) VALUES (?, ?, 'MODERATOR', 'active', 'FREE', ?, ?)`)
    .run('mod' + now, hash, now, now);

  const modId = db.prepare('SELECT id FROM users WHERE username = ?').get('mod' + now).id;
  db.prepare(`
    INSERT INTO media (name, version, image_url, file_url, package, description, price, created_by, created_at, updated_at, active)
    VALUES ('Sample', '1.0', 'https://example.com/x.png', 'https://example.com/f.zip', 'FREE', 'desc', 0, ?, ?, ?, 1)
  `).run(modId, now, now);

  const c = makeClient();
  const uniq = 'u' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  await verifyAntibot(c);

  const list = await c.req('GET', '/api/media/list?package=FREE');
  assert.ok(list.body.data.length >= 1);

  const m = list.body.data[0];
  const r = await c.req('GET', `/api/media/${m.id}/access`);
  assert.strictEqual(r.status, 200);
});

test('path traversal on media file endpoint is blocked', async () => {
  const c = makeClient();
  const uniq = 'pt' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  await verifyAntibot(c);

  const r = await c.req('GET', '/api/media/file/..%2f..%2fetc%2fpasswd');
  // Router không match → 404. Hoặc trả 400.
  assert.ok([400, 403, 404].includes(r.status));
});