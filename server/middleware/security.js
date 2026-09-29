'use strict';
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const config = require('../config');

function buildHelmet() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  });
}

function buildCors() {
  const allow = new Set([config.baseUrl]);
  return cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allow.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Requested-With'],
    maxAge: 600,
  });
}

const keyByIp = (req) => req.ip || req.socket.remoteAddress || 'unknown';

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  keyGenerator: keyByIp,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Quá nhiều yêu cầu' } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: keyByIp,
  message: { success: false, error: { code: 'RATE_LIMIT_AUTH', message: 'Thử lại sau 15 phút' } },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: keyByIp,
  message: { success: false, error: { code: 'RATE_LIMIT_REGISTER', message: 'Thử lại sau' } },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT_UPLOAD', message: 'Quá nhiều upload' } },
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, max: 15,
  message: { success: false, error: { code: 'RATE_LIMIT_PAY', message: 'Quá nhiều yêu cầu thanh toán' } },
});

const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT_SUPPORT', message: 'Quá nhiều yêu cầu hỗ trợ' } },
});

const chatLimiter = rateLimit({
  windowMs: 30 * 1000, max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT_CHAT', message: 'Chậm lại một chút' } },
});

module.exports = {
  buildHelmet, buildCors, compression: compression(),
  globalLimiter, authLimiter, registerLimiter, uploadLimiter,
  paymentLimiter, supportLimiter, chatLimiter,
};