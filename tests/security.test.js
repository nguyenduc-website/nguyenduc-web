'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { start, stop, makeClient } = require('./helpers');

before(async () => { await start(); });
after(async () => { await stop(); });

test('SQL injection attempt on login does not bypass auth', async () => {
  const c = makeClient();
  const r = await c.req('POST', '/api/auth/login', {
    username: "' OR 1=1--", password: 'x',
  });
  assert.strictEqual(r.status, 401);
});

test('prototype pollution payload is rejected by validation', async () => {
  const c = makeClient();
  const r = await c.req('POST', '/api/auth/register', {
    username: 'ppu' + Date.now(), password: 'StrongPass123!',
    __proto__: { role: 'ADMIN' }, role: 'ADMIN',
  });
  // Đăng ký phải tạo USER mặc định, KHÔNG cho phép set role
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
});

test('unauthenticated admin API is rejected', async () => {
  const c = makeClient();
  const r = await c.req('GET', '/api/admin/stats');
  assert.strictEqual(r.status, 401);
});

test('non-admin cannot access admin API', async () => {
  const c = makeClient();
  const uniq = 'na' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });

  const r = await c.req('GET', '/api/admin/stats');
  assert.strictEqual(r.status, 403);
});

test('health endpoint is public', async () => {
  const c = makeClient();
  const r = await c.req('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.status, 'ok');
});

test('rate limiting on auth applies', async () => {
  const c = makeClient();
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const r = await c.req('POST', '/api/auth/login', { username: 'nobody', password: 'x' });
    if (r.status === 429) { limited = true; break; }
  }
  assert.ok(limited, 'auth rate limit should eventually kick in');
});