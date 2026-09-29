'use strict';
const router = require('express').Router();
const { requireAntibot } = require('../middleware/antibot');

router.use('/health', require('./health.routes'));
router.use('/antibot', require('./antibot.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/announcements', require('./announcements.routes'));

// Route yêu cầu AntiBot
router.use('/media', requireAntibot, require('./media.routes'));
router.use('/wallet', requireAntibot, require('./wallet.routes'));
router.use('/notifications', requireAntibot, require('./notifications.routes'));
router.use('/ranking', requireAntibot, require('./ranking.routes'));
router.use('/support', require('./support.routes'));
router.use('/payments', require('./payments.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;