'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/antibot.service');
const { validate } = require('../middleware/validate');
const { security } = require('../services/audit.service');

router.post('/challenge', (req, res) => {
  const c = svc.issueChallenge(req);
  res.json({ success: true, data: c });
});

const verifySchema = z.object({
  id: z.string().min(8).max(64),
  solution: z.union([z.string(), z.number()]),
  elapsedMs: z.number().int().min(0).max(60000),
});

router.post('/verify', validate(verifySchema), (req, res) => {
  const r = svc.verifyChallenge(req, req.validated);
  if (!r.ok) {
    security('antibot_failed', req, { reason: r.reason });
    return res.status(400).json({ success: false, error: { code: 'ANTIBOT_FAIL', message: r.reason } });
  }
  res.cookie('ngduc_ab', r.verificationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000,
    path: '/',
  });
  res.json({ success: true, data: { verified: true, expiresAt: r.expiresAt } });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { verified: svc.isVerified(req) } });
});

module.exports = router;