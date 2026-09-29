'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { start, stop, makeClient } = require('./helpers');

before(async () => { await start(); });
after(async () => { await stop(); });

test('register + login + me + logout flow', async () => {
  const c = makeClient();
  const uniq = 'user' + Date.now();

  let r = await c.req('POST', '/api/auth/register', {
    username: uniq, password: 'StrongPass123!', email: `${uniq}@example.com`,
  });
  assert.strictEqual(r.status, 201);

  r = await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.success, true);
  assert.ok(r.body.data.csrfToken);

  r = await c.req('GET', '/api/auth/me');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.user.username, uniq);

  const csrf = r.body.data.csrfToken;
  r = await c.req('POST', '/api/auth/logout', null, { 'X-CSRF-Token': csrf });
  assert.strictEqual(r.status, 200);
});

test('register rejects weak password', async () => {
  const c = makeClient();
  const r = await c.req('POST', '/api/auth/register', {
    username: 'weakuser_' + Date.now(), password: '123',
  });
  assert.strictEqual(r.status, 400);
});

test('login with wrong password is rejected', async () => {
  const c = makeClient();
  const r = await c.req('POST', '/api/auth/login', { username: 'nobody_xxx', password: 'whatever' });
  assert.strictEqual(r.status, 401);
});

test('CSRF is required for state-changing endpoints', async () => {
  const c = makeClient();
  const uniq = 'csrfu' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });

  const r = await c.req('POST', '/api/auth/logout');
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.error.code, 'CSRF_FAILED');
});