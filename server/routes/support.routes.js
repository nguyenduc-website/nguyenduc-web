'use strict';
const router = require('express').Router();
const { z } = require('zod');
const { requireAuth, requireCsrf } = require('../middleware/auth');
const { requireAntibot } = require('../middleware/antibot');
const { supportLimiter } = require('../middleware/security');
const { validate } = require('../middleware/validate');
const support = require('../services/support.service');
const { audit } = require('../services/audit.service');

const ticketSchema = z.object({
  subject: z.string().min(2).max(150),
  body: z.string().min(5).max(5000),
});

router.post('/tickets',
  supportLimiter,
  validate(ticketSchema),
  (req, res, next) => {
    // Cho phép gửi khi chưa đăng nhập (khách) hoặc đã đăng nhập
    const user = req.user;
    const email = user?.email || (req.body.email && /@/.test(req.body.email) ? String(req.body.email).slice(0, 150) : null);
    if (!email) return res.status(400).json({ success: false, error: { code: 'chuoipc1129@gmail.com', message: 'Cần email liên hệ' } });
    support.createTicket({
      userId: user?.id || null,
      email,
      subject: req.validated.subject,
      body: req.validated.body,
    }).then((r) => {
      audit(req, 'support.ticket', 'ticket', r.id);
      res.json({ success: true, data: { id: r.id, emailSent: r.emailSent, emailConfigured: r.emailConfigured } });
    }).catch(next);
  }
);

router.get('/tickets/mine', requireAuth, (req, res) => {
  res.json({ success: true, data: support.listByUser(req.user.id) });
});

module.exports = router;