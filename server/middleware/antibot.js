'use strict';
const { isVerified } = require('../services/antibot.service');

function requireAntibot(req, res, next) {
  if (isVerified(req)) return next();
  return res.status(403).json({
    success: false,
    error: { code: 'ANTIBOT_REQUIRED', message: 'Cần xác minh AntiBot' },
  });
}

module.exports = { requireAntibot };