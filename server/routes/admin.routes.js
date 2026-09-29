'use strict';
const router = require('express').Router();
const { z } = require('zod');
const db = require('../database');
const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const auth = require('../services/auth.service');
const ann = require('../services/announcement.service');
const notif = require('../services/notification.service');
const support = require('../services/support.service');
const wallet = require('../services/wallet.service');
const mediaSvc = require('../services/media.service');
const ranking = require('../services/ranking.service');
const { decrypt } = require('../security/crypto');
const { audit } = require('../services/audit.service');

router.use(requireAuth, requireRole('ADMIN', 'MODERATOR'));

// Helper: chỉ ADMIN mới được thao tác tài chính
function adminOnly(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: { code: 'ADMIN_ONLY', message: 'Chỉ Admin' } });
  }
  next();
}

router.get('/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const activeUsers = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE last_login_at > ?`).get(Date.now() - 7 * 86400000).c;
  const transactions = db.prepare('SELECT COUNT(*) AS c FROM wallet_transactions').get().c;
  const revenue = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM wallet_transactions WHERE type='DEPOSIT'`).get().s;
  const downloads = db.prepare('SELECT COALESCE(SUM(downloads),0) AS s FROM media').get().s;
  const depositsPending = db.prepare(`SELECT COUNT(*) AS c FROM deposits WHERE status='PENDING'`).get().c;
  const withdrawalsPending = db.prepare(`SELECT COUNT(*) AS c FROM withdrawals WHERE status='PENDING'`).get().c;
  const ticketsOpen = db.prepare(`SELECT COUNT(*) AS c FROM support_tickets WHERE status='OPEN'`).get().c;

  // daily chart last 14 days
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const dayDeposits = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM wallet_transactions WHERE type='DEPOSIT' AND created_at >= ? AND created_at < ?`).get(start.getTime(), end.getTime()).s;
    daily.push({ date: start.toISOString().slice(0, 10), revenue: dayDeposits });
  }

  res.json({ success: true, data: { users, activeUsers, transactions, revenue, downloads, depositsPending, withdrawalsPending, ticketsOpen, daily } });
});

// Users management (ADMIN)
router.get('/users', adminOnly, (req, res) => {
  const q = (req.query.q || '').toString().slice(0, 80);
  const rows = q
    ? db.prepare(`SELECT id, username, email, display_name, role, status, package, created_at, last_login_at FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 200`).all(`%${q}%`, `%${q}%`)
    : db.prepare(`SELECT id, username, email, display_name, role, status, package, created_at, last_login_at FROM users ORDER BY id DESC LIMIT 200`).all();
  res.json({ success: true, data: rows });
});

const userPatchSchema = z.object({
  role: z.enum(['USER','MODERATOR','ADMIN']).optional(),
  status: z.enum(['active','locked','banned']).optional(),
  package: z.enum(['FREE','BASIC','PREMIUM']).optional(),
});

router.patch('/users/:id', adminOnly, requireCsrf, validate(userPatchSchema), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Không có user' } });
  const { role, status, package: pkg } = req.validated;
  db.prepare('UPDATE users SET role = ?, status = ?, package = ?, updated_at = ? WHERE id = ?')
    .run(role ?? target.role, status ?? target.status, pkg ?? target.package, Date.now(), id);
  audit(req, 'admin.user.update', 'user', id, req.validated);
  res.json({ success: true, message: 'Đã cập nhật user' });
});

// Announcements
const annSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(5000),
  kind: z.enum(['ADMIN','MODERATOR','SYSTEM','PAYMENT','SECURITY']).default('ADMIN'),
  requireAck: z.boolean().default(true),
});

router.post('/announcements', requireCsrf, validate(annSchema), (req, res) => {
  const id = ann.create({ ...req.validated, createdBy: req.user.id });
  audit(req, 'admin.announce.create', 'announcement', id);
  res.status(201).json({ success: true, data: { id } });
});

router.get('/announcements', (req, res) => {
  const rows = db.prepare(`SELECT id, title, body, kind, active, require_ack, created_at FROM announcements ORDER BY id DESC LIMIT 200`).all();
  res.json({ success: true, data: rows });
});

router.patch('/announcements/:id', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  ann.update(id, req.body || {});
  audit(req, 'admin.announce.update', 'announcement', id);
  res.json({ success: true });
});

router.delete('/announcements/:id', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  ann.remove(id);
  audit(req, 'admin.announce.delete', 'announcement', id);
  res.json({ success: true });
});

// Broadcast notification
const broadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional().default(''),
  link: z.string().max(500).optional().default(''),
});

router.post('/notifications/broadcast', adminOnly, requireCsrf, validate(broadcastSchema), (req, res) => {
  const users = db.prepare(`SELECT id FROM users WHERE status='active'`).all();
  const now = Date.now();
  const stmt = db.prepare(`INSERT INTO notifications (user_id, kind, title, body, link, created_at) VALUES (?, 'ADMIN', ?, ?, ?, ?)`);
  const tx = db.transaction(() => { users.forEach(u => stmt.run(u.id, req.validated.title, req.validated.body, req.validated.link, now)); });
  tx();
  audit(req, 'admin.notif.broadcast', null, null, { count: users.length });
  res.json({ success: true, data: { sent: users.length } });
});

// Media admin
router.delete('/media/:id', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const m = db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Không có media' } });
  db.prepare('UPDATE media SET active = 0, updated_at = ? WHERE id = ?').run(Date.now(), id);
  if (m.image_path) mediaSvc.safeUnlink(m.image_path);
  if (m.file_path) mediaSvc.safeUnlink(m.file_path);
  audit(req, 'admin.media.delete', 'media', id);
  res.json({ success: true });
});

// Withdrawals (ADMIN)
router.get('/withdrawals', adminOnly, (req, res) => {
  const status = req.query.status;
  const rows = status
    ? db.prepare(`SELECT * FROM withdrawals WHERE status = ? ORDER BY created_at DESC LIMIT 200`).all(status)
    : db.prepare(`SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT 200`).all();
  const mapped = rows.map(r => ({
    id: r.id, user_id: r.user_id, amount: r.amount, fee: r.fee, bank_name: r.bank_name,
    bank_account: safeDec(r.bank_account_enc), bank_account_name: safeDec(r.bank_account_name_enc),
    status: r.status, admin_note: r.admin_note, created_at: r.created_at,
  }));
  res.json({ success: true, data: mapped });
});

function safeDec(v) { try { return decrypt(v) || '***'; } catch { return '***'; } }

const wdDecideSchema = z.object({
  action: z.enum(['APPROVE','REJECT','PROCESSING','COMPLETED']),
  note: z.string().max(500).optional().default(''),
});

router.post('/withdrawals/:id/decide', adminOnly, requireCsrf, validate(wdDecideSchema), (req, res) => {
  const id = req.params.id;
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
  if (!w) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Không có withdrawal' } });
  if (w.status !== 'PENDING' && req.validated.action === 'APPROVE') {
    return res.status(400).json({ success: false, error: { code: 'BAD_STATE', message: 'Đã xử lý' } });
  }
  const map = { APPROVE: 'APPROVED', REJECT: 'REJECTED', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED' };
  const next = map[req.validated.action];

  const tx = db.transaction(() => {
    db.prepare('UPDATE withdrawals SET status = ?, admin_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?')
      .run(next, req.validated.note || null, req.user.id, Date.now(), Date.now(), id);

    if (next === 'REJECTED') {
      wallet.applyTransaction({
        userId: w.user_id,
        delta: w.amount + w.fee,
        type: 'REFUND',
        refType: 'withdrawal',
        refId: id,
        description: 'Hoàn tiền do rút bị từ chối',
      });
    }
    notif.create(w.user_id, {
      kind: 'PAYMENT',
      title: `Yêu cầu rút tiền ${next}`,
      body: `Mã ${id}`,
    });
  });
  tx();

  audit(req, 'admin.withdraw.decide', 'withdrawal', id, { action: next });
  res.json({ success: true, data: { status: next } });
});

// Deposits pending
router.get('/deposits', adminOnly, (req, res) => {
  const rows = db.prepare(`SELECT * FROM deposits WHERE status='PENDING' ORDER BY created_at DESC LIMIT 200`).all();
  res.json({ success: true, data: rows });
});

const depDecideSchema = z.object({ action: z.enum(['PAID','FAILED','EXPIRED','CANCELLED']) });

router.post('/deposits/:id/decide', adminOnly, requireCsrf, validate(depDecideSchema), (req, res) => {
  const id = req.params.id;
  const d = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Không có deposit' } });
  if (d.status !== 'PENDING') return res.status(400).json({ success: false, error: { code: 'BAD_STATE', message: 'Đã xử lý' } });

  const tx = db.transaction(() => {
    db.prepare('UPDATE deposits SET status = ?, updated_at = ? WHERE id = ?').run(req.validated.action, Date.now(), id);
    db.prepare('UPDATE payment_orders SET status = ?, updated_at = ? WHERE id = ?').run(req.validated.action, Date.now(), id);
    if (req.validated.action === 'PAID') {
      wallet.applyTransaction({
        userId: d.user_id,
        delta: d.amount,
        type: 'DEPOSIT',
        refType: 'manual_confirm',
        refId: id,
        description: 'Nạp tiền được xác nhận bởi Admin',
      });
      notif.create(d.user_id, { kind: 'PAYMENT', title: 'Nạp tiền thành công', body: `+${d.amount.toLocaleString('vi-VN')}đ` });
    }
  });
  tx();

  audit(req, 'admin.deposit.decide', 'deposit', id, { action: req.validated.action });
  res.json({ success: true });
});

// Support tickets
router.get('/support', (req, res) => {
  res.json({ success: true, data: support.listAll(req.query.status) });
});

router.post('/support/:id/status', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = String(req.body?.status || '');
  if (!['OPEN','IN_PROGRESS','RESOLVED','CLOSED'].includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'BAD_STATUS', message: 'Trạng thái không hợp lệ' } });
  }
  support.updateStatus(id, status);
  audit(req, 'admin.support.status', 'ticket', id, { status });
  res.json({ success: true });
});

// Audit logs
router.get('/audit-logs', adminOnly, (req, res) => {
  const rows = db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500`).all();
  res.json({ success: true, data: rows });
});

// Security events
router.get('/security-events', adminOnly, (req, res) => {
  const rows = db.prepare(`SELECT * FROM security_events ORDER BY id DESC LIMIT 500`).all();
  res.json({ success: true, data: rows });
});

// Settings
router.get('/settings', adminOnly, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json({ success: true, data: rows });
});

const settingSchema = z.object({ key: z.string().min(1).max(80), value: z.string().max(2000) });

router.post('/settings', adminOnly, requireCsrf, validate(settingSchema), (req, res) => {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(req.validated.key, req.validated.value, Date.now());
  audit(req, 'admin.setting.update', 'setting', req.validated.key);
  res.json({ success: true });
});

// Ranking recalc (utility)
router.get('/ranking', (req, res) => {
  res.json({ success: true, data: ranking.top(100, 0) });
});

module.exports = router;