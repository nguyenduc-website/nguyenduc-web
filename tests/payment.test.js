'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { start, stop, makeClient } = require('./helpers');

before(async () => { await start(); });
after(async () => { await stop(); });

test('deposit endpoint refuses when no provider is enabled', async () => {
  const c = makeClient();
  const uniq = 'py' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  const lr = await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  const csrf = lr.body.data.csrfToken;

  // solve antibot
  const crypto = require('crypto');
  const ch = await c.req('POST', '/api/antibot/challenge');
  const { id, nonce, difficulty } = ch.body.data;
  let s = 0;
  const t = '0'.repeat(difficulty);
  while (s < 5_000_000) {
    const h = crypto.createHash('sha256').update(nonce + ':' + s).digest('hex');
    if (h.startsWith(t)) break;
    s++;
  }
  await c.req('POST', '/api/antibot/verify', { id, solution: s, elapsedMs: 2000 });

  const r = await c.req('POST', '/api/wallet/deposits', {
    amount: 50000, provider: 'ZALOPAY',
  }, { 'X-CSRF-Token': csrf });

  // Không có credentials → provider disabled
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.body.error.code, 'PROVIDER_DISABLED');
});

test('invalid webhook signature is rejected', async () => {
  const c = makeClient();
  const r = await c.req('POST', '/api/payments/webhook/ZALOPAY', {
    data: 'fake', mac: 'bad',
  });
  assert.strictEqual(r.status, 400);
});

test('negative deposit amount is rejected', async () => {
  const c = makeClient();
  const uniq = 'py2' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  const lr = await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  const csrf = lr.body.data.csrfToken;

  const crypto = require('crypto');
  const ch = await c.req('POST', '/api/antibot/challenge');
  const { id, nonce, difficulty } = ch.body.data;
  let s = 0;
  const t = '0'.repeat(difficulty);
  while (s < 5_000_000) {
    const h = crypto.createHash('sha256').update(nonce + ':' + s).digest('hex');
    if (h.startsWith(t)) break;
    s++;
  }
  await c.req('POST', '/api/antibot/verify', { id, solution: s, elapsedMs: 2000 });

  const r = await c.req('POST', '/api/wallet/deposits', {
    amount: -1000, provider: 'MANUAL_BANK',
  }, { 'X-CSRF-Token': csrf });

  assert.strictEqual(r.status, 400);
});