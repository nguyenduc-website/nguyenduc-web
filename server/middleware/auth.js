'use strict';
const db = require('../database');
const { findSession } = require('../services/auth.service');
const { timingSafeEqualStr } = require('../security/crypto');

const COOKIE = 'ngduc_sid';

function loadUser(req, res, next) {
  const sid = req.cookies?.[COOKIE];
  const s = findSession(sid);
  if (!s) { req.user = null; req.session = null; return next(); }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  if (!u || u.status !== 'active') { req.user = null; req.session = null; return next(); }
  req.user = u;
  req.session = s;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Không đủ quyền' } });
    }
    next();
  };
}

function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET','HEAD','OPTIONS'].includes(method)) return next();
  if (!req.session) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } });
  const token = req.headers['x-csrf-token'] || req.body?._csrf;
  if (!token || !timingSafeEqualStr(token, req.session.csrf_token)) {
    return res.status(403).json({ success: false, error: { code: 'CSRF_FAILED', message: 'CSRF token không hợp lệ' } });
  }
  next();
}

module.exports = { loadUser, requireAuth, requireRole, requireCsrf, COOKIE };