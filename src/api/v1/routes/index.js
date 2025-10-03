const express = require('express');
const router = express.Router();

// Mount all v1 routes
router.use('/auth', require('./auth.routes'));
router.use('/auth/2fa', require('./twoFactor.routes'));
router.use('/certificates', require('./certificates'));
router.use('/organizations', require('./organizations.routes'));
router.use('/queues', require('./queues.routes'));
router.use('/cache', require('./cache.routes'));
router.use('/health', require('./monitoring.routes'));
router.use('/diagnostics', require('./diagnostics.routes'));
router.use('/errors', require('./errors.routes'));

// Metrics route (separado de monitoring porque es diferente)
router.use('/metrics', require('./metrics.routes'));

module.exports = router;