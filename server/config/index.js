'use strict';
require('dotenv').config();

const path = require('path');

function required(name, fallback = null) {
  const v = process.env[name];
  if (!v && fallback === null && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required env: ${name}`);
  }
  return v || fallback;
}

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),

  dbPath: path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/ngduc.db'),

  sessionSecret: required('SESSION_SECRET', 'dev_session_secret_change_me_now_1234567890'),
  csrfSecret: required('CSRF_SECRET', 'dev_csrf_secret_change_me_now_1234567890'),
  encryptionKey: required('ENCRYPTION_KEY', 'dev_encryption_key_change_me_64_hex_00000000000000000000000000000000'),
  antibotSecret: required('ANTIBOT_SECRET', 'dev_antibot_secret_change_me_1234567890'),

  sessionTtlMs: 1000 * 60 * 60 * 24 * 14, // 14 ngày
  antibotTtlMs: 1000 * 60 * 30,            // 30 phút
  antibotChallengeTtlMs: 1000 * 60 * 5,    // 5 phút

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || '',
    supportEmail: process.env.SUPPORT_EMAIL || '',
    enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
  },

  zalopay: {
    appId: process.env.ZALOPAY_APP_ID || '',
    key1: process.env.ZALOPAY_KEY1 || '',
    key2: process.env.ZALOPAY_KEY2 || '',
    endpoint: process.env.ZALOPAY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create',
    callbackUrl: process.env.ZALOPAY_CALLBACK_URL || '',
    redirectUrl: process.env.ZALOPAY_REDIRECT_URL || '',
    enabled: !!(process.env.ZALOPAY_APP_ID && process.env.ZALOPAY_KEY1 && process.env.ZALOPAY_KEY2),
  },

  bank: {
    name: process.env.BANK_NAME || '',
    account: process.env.BANK_ACCOUNT || '',
    accountName: process.env.BANK_ACCOUNT_NAME || '',
    qrTemplate: process.env.BANK_QR_TEMPLATE || 'compact2',
    enabled: !!(process.env.BANK_NAME && process.env.BANK_ACCOUNT),
  },

  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
};