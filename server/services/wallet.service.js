'use strict';
const db = require('../database');

function ensureWallet(userId) {
  const existing = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
  if (existing) return existing;
  const now = Date.now();
  db.prepare('INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)').run(userId, now);
  return db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId);
}

function getBalance(userId) {
  const w = ensureWallet(userId);
  return w.balance;
}

/**
 * Áp dụng thay đổi balance trong 1 transaction, ghi ledger.
 * delta > 0: cộng tiền; delta < 0: trừ tiền
 */
function applyTransaction({ userId, delta, type, refType = null, refId = null, description = null, metadata = null }) {
  if (!['DEPOSIT','WITHDRAW','PURCHASE','REFUND','ADJUSTMENT','BONUS'].includes(type)) {
    throw Object.assign(new Error('Invalid tx type'), { status: 400, code: 'INVALID_TX_TYPE' });
  }
  if (!Number.isInteger(delta) || delta === 0) {
    throw Object.assign(new Error('Invalid amount'), { status: 400, code: 'INVALID_AMOUNT' });
  }

  const tx = db.transaction(() => {
    ensureWallet(userId);
    const w = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(userId);
    const next = w.balance + delta;
    if (next < 0) {
      throw Object.assign(new Error('Số dư không đủ'), { status: 400, code: 'INSUFFICIENT_BALANCE' });
    }
    const now = Date.now();
    db.prepare('UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?').run(next, now, userId);
    const info = db.prepare(`
      INSERT INTO wallet_transactions (user_id, type, amount, balance_after, ref_type, ref_id, description, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, type, delta, next, refType, refId, description, metadata ? JSON.stringify(metadata) : null, now);
    return { txId: info.lastInsertRowid, balance: next };
  });
  return tx();
}

function listTransactions(userId, limit = 50, offset = 0) {
  return db.prepare(`
    SELECT id, type, amount, balance_after, ref_type, ref_id, description, created_at
    FROM wallet_transactions WHERE user_id = ?
    ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

module.exports = { ensureWallet, getBalance, applyTransaction, listTransactions };