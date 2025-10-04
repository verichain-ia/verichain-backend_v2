const express = require('express');
const router = express.Router();

// v2 improvements: grouped routes, better naming
router.use('/auth', require('./auth.routes'));
router.use('/auth/2fa', require('./twoFactor.routes'));
router.use('/certificates', require('./certificates'));
router.use('/organizations', require('./organizations.routes'));
router.use('/jobs', require('./queues.routes')); // Renamed from queues
router.use('/cache', require('./cache.routes'));
router.use('/health', require('./monitoring.routes'));
router.use('/diagnostics', require('./diagnostics.routes'));
router.use('/errors', require('./errors.routes'));
router.use('/webhooks', require('./webhooks.routes'));
router.use('/monitoring', require('./monitoring.routes'));

// Analytics route (renombrado de metrics)
router.use('/analytics', require('./metrics.routes'));

// v2 new features (to be implemented)

module.exports = router;