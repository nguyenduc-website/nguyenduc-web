'use strict';
const router = require('express').Router();
const { z } = require('zod');
const db = require('../database');
const config = require('../config');
const { requireAuth, requireCsrf } = require('../middleware/auth');
const { requireAntibot } = require('../middleware/antibot');
const { validate } = require('../middleware/validate');
const wallet = require('../services/wallet.service');
const { encrypt } = require('../security/crypto');
const { audit } = require('../services/audit.service');
const { paymentLimiter } = require('../middleware/security');
const { getProvider, listAvailable } = require('../payments');

router.use(requireAuth, requireAntibot);

router.get('/', (req, res) => {
  const w = wallet.ensureWallet(req.user.id);
  res.json({ success: true, data: { balance: w.balance } });
});

router.get('/transactions', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  res.json({ success: true, data: wallet.listTransactions(req.user.id, limit, offset) });
});

router.get('/providers', (req, res) => {
  res.json({ success: true, data: listAvailable() });
});

const depositSchema = z.object({
  amount: z.number().int().positive().min(1000).max(100_000_000),
  provider: z.enum(['QR', 'MANUAL_BANK', 'ZALOPAY']),
});

router.post('/deposits', paymentLimiter, requireCsrf, validate(depositSchema), async (req, res, next) => {
  try {
    const { amount, provider } = req.validated;
    const p = getProvider(provider);
    if (!p.enabled) {
      return res.status(503).json({
        success: false,
        error: { code: 'PROVIDER_DISABLED', message: 'Phương thức thanh toán chưa được cấu hình' },
      });
    }

    const orderId = 'ORD' + Date.now() + Math.floor(Math.random() * 9000 + 1000);
    const now = Date.now();
    db.prepare(`
      INSERT INTO payment_orders (id, user_id, provider, amount, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'VND', 'PENDING', ?, ?)
    `).run(orderId, req.user.id, provider, amount, now, now);

    const result = await p.createPayment({ id: orderId, userId: req.user.id, amount });

    db.prepare('UPDATE payment_orders SET response_payload = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(result), Date.now(), orderId);

    db.prepare(`
      INSERT INTO deposits (id, user_id, amount, provider, status, external_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `).run(orderId, req.user.id, amount, provider, result.appTransId || result.memo || null, now, now);

    audit(req, 'deposit.create', 'order', orderId, { amount, provider });
    res.json({ success: true, data: { orderId, ...result } });
  } catch (e) { next(e); }
});

router.get('/deposits', (req, res) => {
  const rows = db.prepare(`
    SELECT id, amount, provider, status, external_ref, created_at, updated_at
    FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
  `).all(req.user.id);
  res.json({ success: true, data: rows });
});

const withdrawSchema = z.object({
  amount: z.number().int().positive(),
  bankName: z.string().min(2).max(80),
  bankAccount: z.string().min(6).max(32),
  bankAccountName: z.string().min(2).max(80),
});

router.post('/withdrawals', paymentLimiter, requireCsrf, validate(withdrawSchema), (req, res, next) => {
  try {
    const { amount, bankName, bankAccount, bankAccountName } = req.validated;
    const get = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
    const minW = parseInt(get('wallet.min_withdraw') || '50000', 10);
    const maxW = parseInt(get('wallet.max_withdraw') || '50000000', 10);
    const fee = parseInt(get('wallet.withdraw_fee') || '0', 10);

    if (amount < minW || amount > maxW) {
      return res.status(400).json({ success: false, error: { code: 'AMOUNT_OUT_OF_RANGE', message: `Số tiền phải từ ${minW} đến ${maxW}` } });
    }

    const w = wallet.ensureWallet(req.user.id);
    if (w.balance < amount + fee) {
      return res.status(400).json({ success: false, error: { code: 'INSUFFICIENT_BALANCE', message: 'Số dư không đủ' } });
    }

    const id = 'WD' + Date.now() + Math.floor(Math.random() * 9000 + 1000);
    const now = Date.now();
    const tx = db.transaction(() => {
      wallet.applyTransaction({
        userId: req.user.id,
        delta: -(amount + fee),
        type: 'WITHDRAW',
        refType: 'withdrawal',
        refId: id,
        description: 'Yêu cầu rút tiền',
      });
      db.prepare(`
        INSERT INTO withdrawals (id, user_id, amount, fee, bank_name, bank_account_enc, bank_account_name_enc, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(id, req.user.id, amount, fee, bankName, encrypt(bankAccount), encrypt(bankAccountName), now, now);
    });
    tx();

    audit(req, 'withdraw.request', 'withdrawal', id, { amount, fee });
    res.json({ success: true, data: { id, amount, fee, status: 'PENDING' } });
  } catch (e) { next(e); }
});

router.get('/withdrawals', (req, res) => {
  const rows = db.prepare(`
    SELECT id, amount, fee, bank_name, status, admin_note, created_at, updated_at
    FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
  `).all(req.user.id);
  res.json({ success: true, data: rows });
});

module.exports = router;