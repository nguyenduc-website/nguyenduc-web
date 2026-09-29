'use strict';
const config = require('../config');

function notFound(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } });
}

function errorHandler(err, req, res, _next) {
  console.error('[error]', err.message, err.stack?.split('\n')[1]);
  if (res.headersSent) return;
  const status = err.status || 500;
  const body = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status >= 500 && config.isProd ? 'Lỗi hệ thống' : (err.message || 'Lỗi hệ thống'),
    },
  };
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };