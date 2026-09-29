'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { start, stop, makeClient, db } = require('./helpers');
const wallet = require('../server/services/wallet.service');

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

test('wallet service applies ledger and rejects negative balance', () => {
  const now = Date.now();
  const info = db.prepare(`INSERT INTO users (username, password_hash, role, status, package, created_at, updated_at) VALUES (?, ?, 'USER', 'active', 'FREE', ?, ?)`)
    .run('wtest' + now, 'x', now, now);
  const uid = info.lastInsertRowid;
  wallet.ensureWallet(uid);

  let r = wallet.applyTransaction({ userId: uid, delta: 10000, type: 'DEPOSIT' });
  assert.strictEqual(r.balance, 10000);

  assert.throws(() => {
    wallet.applyTransaction({ userId: uid, delta: -20000, type: 'WITHDRAW' });
  }, /Số dư không đủ/);

  r = wallet.applyTransaction({ userId: uid, delta: -5000, type: 'WITHDRAW' });
  assert.strictEqual(r.balance, 5000);

  const txs = wallet.listTransactions(uid);
  assert.strictEqual(txs.length, 2);
});

test('withdrawal via API requires antibot + csrf and deducts balance', async () => {
  const c = makeClient();
  const uniq = 'wd' + Date.now();
  await c.req('POST', '/api/auth/register', { username: uniq, password: 'StrongPass123!' });
  const lr = await c.req('POST', '/api/auth/login', { username: uniq, password: 'StrongPass123!' });
  const csrf = lr.body.data.csrfToken;

  await verifyAntibot(c);

  // cộng tiền thủ công vào ví
  const uid = lr.body.data.user.id;
  wallet.ensureWallet(uid);
  wallet.applyTransaction({ userId: uid, delta: 100000, type: 'DEPOSIT' });

  const r = await c.req('POST', '/api/wallet/withdrawals', {
    amount: 50000, bankName: 'Test Bank', bankAccount: '1234567890', bankAccountName: 'Nguyen Van A',
  }, { 'X-CSRF-Token': csrf });

  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.data.status, 'PENDING');

  const w = wallet.ensureWallet(uid);
  assert.strictEqual(w.balance, 50000);
});