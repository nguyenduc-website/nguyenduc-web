'use strict';
const router = require('express').Router();
const { z } = require('zod');
const db = require('../database');
const config = require('../config');
const auth = require('../services/auth.service');
const notif = require('../services/notification.service');
const { validate } = require('../middleware/validate');
const { requireAuth, requireCsrf, COOKIE } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/security');
const { audit, security } = require('../services/audit.service');

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.string().email().max(120).optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
});

router.post('/register', registerLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { username, email, password, displayName } = req.validated;
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'USERNAME_TAKEN', message: 'Tên đăng nhập đã tồn tại' } });
    }
    if (email) {
      const e = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (e) return res.status(409).json({ success: false, error: { code: 'EMAIL_TAKEN', message: 'Email đã dùng' } });
    }
    const hash = await auth.hashPassword(password);
    const now = Date.now();
    const info = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, role, status, package, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'USER', 'active', 'FREE', ?, ?)
    `).run(username, email || null, hash, displayName || username, now, now);
    const uid = info.lastInsertRowid;
    db.prepare('INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)').run(uid, now);
    db.prepare('INSERT INTO rankings (user_id, points, activity, updated_at) VALUES (?, 0, 0, ?)').run(uid, now);
    notif.create(uid, { kind: 'SYSTEM', title: 'Chào mừng đến NGUYỄN ĐỨC • Web • Store', body: 'Tài khoản đã tạo thành công. Hãy xác minh AntiBot để sử dụng đầy đủ tính năng.' });
    audit(req, 'user.register', 'user', uid);
    res.status(201).json({ success: true, data: { id: uid }, message: 'Đăng ký thành công' });
  } catch (e) { next(e); }
});

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(128),
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.validated;
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      security('login_fail', req, { username });
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Sai tài khoản hoặc mật khẩu' } });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: { code: 'ACCOUNT_DISABLED', message: 'Tài khoản bị khóa' } });
    }
    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) {
      security('login_fail', req, { userId: user.id });
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Sai tài khoản hoặc mật khẩu' } });
    }
    const { id: sid, csrf } = auth.createSession(user.id, req);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), user.id);
    res.cookie(COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: config.sessionTtlMs,
      path: '/',
    });
    audit(req, 'user.login', 'user', user.id);
    res.json({
      success: true,
      data: { user: auth.sanitizeUser(user), csrfToken: csrf },
      message: 'Đăng nhập thành công',
    });
  } catch (e) { next(e); }
});

router.post('/logout', requireAuth, requireCsrf, (req, res) => {
  auth.revokeSession(req.session.id);
  res.clearCookie(COOKIE, { path: '/' });
  audit(req, 'user.logout', 'user', req.user.id);
  res.json({ success: true, message: 'Đã đăng xuất' });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ success: true, data: null });
  res.json({
    success: true,
    data: { user: auth.sanitizeUser(req.user), csrfToken: req.session.csrf_token },
  });
});

const changePwSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

router.post('/change-password', requireAuth, requireCsrf, validate(changePwSchema), async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.validated;
    const ok = await auth.verifyPassword(oldPassword, req.user.password_hash);
    if (!ok) return res.status(400).json({ success: false, error: { code: 'BAD_PASSWORD', message: 'Mật khẩu cũ sai' } });
    const hash = await auth.hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, Date.now(), req.user.id);
    auth.revokeAllForUser(req.user.id, req.session.id);
    audit(req, 'user.change_password', 'user', req.user.id);
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (e) { next(e); }
});

router.post('/logout-all', requireAuth, requireCsrf, (req, res) => {
  auth.revokeAllForUser(req.user.id);
  res.clearCookie(COOKIE, { path: '/' });
  audit(req, 'user.logout_all', 'user', req.user.id);
  res.json({ success: true, message: 'Đã đăng xuất tất cả thiết bị' });
});

router.get('/sessions', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, ip, user_agent, created_at, expires_at FROM sessions
    WHERE user_id = ? AND revoked = 0 AND expires_at > ?
    ORDER BY created_at DESC
  `).all(req.user.id, Date.now());
  res.json({ success: true, data: rows });
});

module.exports = router;