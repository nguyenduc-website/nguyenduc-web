'use strict';
const router = require('express').Router();
const db = require('../database');
const { getProvider } = require('../payments');
const wallet = require('../services/wallet.service');
const notif = require('../services/notification.service');
const { security } = require('../services/audit.service');

// Webhook công khai — không yêu cầu login, yêu cầu chữ ký hợp lệ
router.post('/webhook/:provider', (req, res, next) => {
  try {
    const provider = getProvider(req.params.provider.toUpperCase());
    const raw = JSON.stringify(req.body);
    const sig = req.headers['x-signature'] || req.body?.mac || '';

    const verify = provider.verifyWebhook(req);
    if (!verify.ok) {
      db.prepare(`
        INSERT INTO payment_webhooks (provider, order_id, signature, payload, valid, processed, error, created_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `).run(provider.name, req.body?.order_id || null, sig, raw, verify.reason || 'INVALID', Date.now());
      security('payment_webhook_invalid', req, { provider: provider.name, reason: verify.reason });
      return res.status(400).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: verify.reason } });
    }

    // ZaloPay callback format
    if (provider.name === 'ZALOPAY') {
      const data = verify.data;
      const orderId = String(data.app_trans_id || '').split('_').pop();
      const zpTransId = data.zp_trans_id;
      const amount = data.amount;

      const order = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
      if (!order) return res.json({ return_code: 2, return_message: 'order not found' });

      // Idempotency: nếu đã xử lý
      const dup = db.prepare(`
        SELECT id FROM payment_webhooks WHERE provider = ? AND order_id = ? AND signature = ? AND processed = 1
      `).get(provider.name, orderId, sig);
      if (dup) return res.json({ return_code: 1, return_message: 'already processed' });

      const insert = db.prepare(`
        INSERT OR IGNORE INTO payment_webhooks (provider, order_id, signature, payload, valid, processed, created_at)
        VALUES (?, ?, ?, ?, 1, 0, ?)
      `).run(provider.name, orderId, sig, raw, Date.now());

      if (insert.changes === 1) {
        if (order.status === 'PENDING') {
          const tx = db.transaction(() => {
            db.prepare('UPDATE payment_orders SET status = ?, paid_at = ?, updated_at = ? WHERE id = ?')
              .run('PAID', Date.now(), Date.now(), orderId);
            db.prepare('UPDATE deposits SET status = ?, updated_at = ? WHERE id = ?')
              .run('PAID', Date.now(), orderId);
            wallet.applyTransaction({
              userId: order.user_id,
              delta: amount,
              type: 'DEPOSIT',
              refType: 'zalopay',
              refId: String(zpTransId || orderId),
              description: 'Nạp tiền ZaloPay',
            });
            notif.create(order.user_id, { kind: 'PAYMENT', title: 'Nạp tiền thành công', body: `+${amount.toLocaleString('vi-VN')}đ qua ZaloPay` });
            db.prepare('UPDATE payment_webhooks SET processed = 1 WHERE provider = ? AND order_id = ? AND signature = ?')
              .run(provider.name, orderId, sig);
          });
          tx();
        }
      }
      return res.json({ return_code: 1, return_message: 'success' });
    }

    return res.json({ success: true });
  } catch (e) { next(e); }
});


const { requireAuth, requireRole, requireCsrf } = require('../middleware/auth');
const { requireAntibot } = require('../middleware/antibot');
const { z } = require('zod');
const { encrypt, decrypt } = require('../security/crypto');

const manualSchema = z.object({
  method: z.enum(['QR', 'CARD']),
  amount: z.number().int().min(0).max(100_000_000).default(0),
  cardCode: z.string().trim().min(4).max(80).optional(),
  cardSeri: z.string().trim().min(4).max(80).optional(),
});

function publicManualRow(r) {
  return {
    id: r.id,
    method: r.method,
    amount: r.amount,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Khách tạo yêu cầu thanh toán thủ công.
router.post('/manual', requireAuth, requireAntibot, requireCsrf, (req, res, next) => {
  try {
    const parsed = manualSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Thông tin thanh toán không hợp lệ' } });
    }
    const { method, amount, cardCode, cardSeri } = parsed.data;
    if (method === 'QR' && amount < 1000) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Số tiền QR tối thiểu là 1.000đ' } });
    }
    if (method === 'CARD' && (!cardCode || !cardSeri)) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_CARD', message: 'Vui lòng nhập Mã Thẻ và Số Seri' } });
    }

    const id = 'MAN' + Date.now() + Math.floor(Math.random() * 9000 + 1000);
    const now = Date.now();
    db.prepare(`
      INSERT INTO manual_payment_requests
      (id, user_id, method, amount, card_code_enc, card_seri_enc, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      id, req.user.id, method, amount || 0,
      method === 'CARD' ? encrypt(cardCode) : null,
      method === 'CARD' ? encrypt(cardSeri) : null,
      now, now
    );

    notif.create(req.user.id, {
      kind: 'PAYMENT',
      title: 'Đã nhận yêu cầu thanh toán',
      body: method === 'QR'
        ? `Yêu cầu ${id}: Admin sẽ kiểm tra khoản chuyển ${amount.toLocaleString('vi-VN')}đ.`
        : `Yêu cầu ${id}: thẻ cào đang chờ Admin kiểm tra.`,
      link: '#wallet',
    });

    res.status(201).json({
      success: true,
      data: {
        id,
        method,
        amount: amount || 0,
        status: 'PENDING',
        message: 'Đã gửi yêu cầu. Vui lòng chờ Admin kiểm tra.',
      },
    });
  } catch (e) { next(e); }
});

router.get('/manual', requireAuth, requireAntibot, (req, res) => {
  const rows = db.prepare(`
    SELECT id, method, amount, status, admin_note, created_at, updated_at
    FROM manual_payment_requests
    WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 100
  `).all(req.user.id);
  res.json({ success: true, data: rows.map(publicManualRow) });
});

// Admin xem tất cả yêu cầu.
router.get('/manual/admin', requireAuth, requireRole('ADMIN'), (req, res) => {
  const status = ['PENDING', 'PAID', 'FAILED'].includes(req.query.status) ? req.query.status : null;
  const rows = status
    ? db.prepare(`
        SELECT m.*, u.username, u.display_name, u.email
        FROM manual_payment_requests m JOIN users u ON u.id=m.user_id
        WHERE m.status=? ORDER BY m.created_at DESC LIMIT 300
      `).all(status)
    : db.prepare(`
        SELECT m.*, u.username, u.display_name, u.email
        FROM manual_payment_requests m JOIN users u ON u.id=m.user_id
        ORDER BY m.created_at DESC LIMIT 300
      `).all();

  res.json({
    success: true,
    data: rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      email: r.email,
      method: r.method,
      amount: r.amount,
      cardCode: r.card_code_enc ? safeDecrypt(r.card_code_enc) : null,
      cardSeri: r.card_seri_enc ? safeDecrypt(r.card_seri_enc) : null,
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

function safeDecrypt(v) {
  try { return decrypt(v); } catch { return '***'; }
}

const manualDecisionSchema = z.object({
  action: z.enum(['PAID', 'FAILED']),
  amount: z.number().int().min(0).max(100_000_000).optional(),
  note: z.string().trim().max(500).optional().default(''),
});

router.post('/manual/admin/:id/decide', requireAuth, requireRole('ADMIN'), requireCsrf, (req, res, next) => {
  try {
    const parsed = manualDecisionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu duyệt không hợp lệ' } });

    const id = String(req.params.id);
    const row = db.prepare('SELECT * FROM manual_payment_requests WHERE id=?').get(id);
    if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy yêu cầu' } });
    if (row.status !== 'PENDING') return res.status(400).json({ success: false, error: { code: 'BAD_STATE', message: 'Yêu cầu đã được xử lý' } });

    let amount = row.amount;
    if (row.method === 'CARD') {
      amount = parsed.data.amount ?? 0;
      if (parsed.data.action === 'PAID' && amount < 1) {
        return res.status(400).json({ success: false, error: { code: 'AMOUNT_REQUIRED', message: 'Nhập số tiền thực tế cần cộng cho thẻ trước khi duyệt' } });
      }
    }
    if (row.method === 'QR' && parsed.data.action === 'PAID' && amount < 1) {
      return res.status(400).json({ success: false, error: { code: 'AMOUNT_REQUIRED', message: 'Yêu cầu QR chưa có số tiền hợp lệ' } });
    }

    const nextStatus = parsed.data.action;
    const now = Date.now();
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE manual_payment_requests
        SET amount=?, status=?, admin_note=?, decided_by=?, decided_at=?, updated_at=?
        WHERE id=?
      `).run(amount, nextStatus, parsed.data.note || null, req.user.id, now, now, id);

      if (nextStatus === 'PAID') {
        wallet.applyTransaction({
          userId: row.user_id,
          delta: amount,
          type: 'DEPOSIT',
          refType: 'manual_payment',
          refId: id,
          description: row.method === 'QR' ? 'Nạp tiền QR được Admin xác nhận' : 'Nạp thẻ cào được Admin xác nhận',
        });
        notif.create(row.user_id, {
          kind: 'PAYMENT',
          title: row.method === 'QR' ? 'Thanh toán hoàn tất' : '✓ Thẻ đã được duyệt',
          body: row.method === 'QR'
            ? `Admin đã xác nhận. +${amount.toLocaleString('vi-VN')}đ đã được cộng vào ví.`
            : `Thẻ đã được duyệt. +${amount.toLocaleString('vi-VN')}đ đã được cộng vào ví.`,
          link: '#wallet',
        });
      } else {
        notif.create(row.user_id, {
          kind: 'PAYMENT',
          title: row.method === 'QR' ? 'Admin chưa xác nhận thanh toán' : '✗ Thẻ bị từ chối',
          body: row.method === 'QR'
            ? (parsed.data.note || 'Admin vẫn chưa nhận được số tiền hoặc giao dịch chưa hoàn tất.')
            : (parsed.data.note || 'Thẻ đã qua sử dụng hoặc không tồn tại.'),
          link: '#wallet',
        });
      }
    });
    tx();

    security('manual_payment_decision', req, { id, action: nextStatus, method: row.method, amount });
    res.json({ success: true, data: { id, status: nextStatus, amount } });
  } catch (e) { next(e); }
});

module.exports = router;