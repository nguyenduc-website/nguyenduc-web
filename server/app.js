'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./config');
const routes = require('./routes');
const { loadUser } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/error');
const sec = require('./middleware/security');

const app = express();

if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

app.use(sec.buildHelmet());
app.use(sec.buildCors());
app.use(sec.compression);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());
app.use(sec.globalLimiter);

app.use(loadUser);

app.use('/api', routes);

// Static
app.use(express.static(path.resolve(process.cwd(), 'public'), {
  extensions: ['html'],
  setHeaders(res, p) {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.resolve(process.cwd(), 'public/index.html'));
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;