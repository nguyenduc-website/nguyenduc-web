'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { start, stop, makeClient } = require('./helpers');

before(async () => { await start(); });
after(async () => { await stop(); });

test('antibot challenge + solve + verify', async () => {
  const c = makeClient();
  let r = await c.req('POST', '/api/antibot/challenge');
  assert.strictEqual(r.status, 200);
  const { id, nonce, difficulty } = r.body.data;
  assert.ok(id && nonce && difficulty > 0);

  // solve
  let solution = 0;
  const target = '0'.repeat(difficulty);
  while (solution < 5_000_000) {
    const h = crypto.createHash('sha256').update(nonce + ':' + solution).digest('hex');
    if (h.startsWith(target)) break;
    solution++;
  }
  assert.ok(solution < 5_000_000);

  r = await c.req('POST', '/api/antibot/verify', { id, solution, elapsedMs: 2000 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.verified, true);

  r = await c.req('GET', '/api/antibot/status');
  assert.strictEqual(r.body.data.verified, true);
});

test('antibot rejects when elapsed too fast', async () => {
  const c = makeClient();
  let r = await c.req('POST', '/api/antibot/challenge');
  const { id, nonce, difficulty } = r.body.data;
  let solution = 0;
  const target = '0'.repeat(difficulty);
  while (solution < 5_000_000) {
    const h = crypto.createHash('sha256').update(nonce + ':' + solution).digest('hex');
    if (h.startsWith(target)) break;
    solution++;
  }
  r = await c.req('POST', '/api/antibot/verify', { id, solution, elapsedMs: 100 });
  assert.strictEqual(r.status, 400);
});

test('wallet API rejects without antibot', async () => {
  const c = makeClient();
  const uniq = 'abw' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });

  // Không làm antibot → phải bị chặn
  const r = await c.req('GET', '/api/wallet');
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.error.code, 'ANTIBOT_REQUIRED');
});