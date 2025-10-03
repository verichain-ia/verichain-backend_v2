const router = require('express').Router();
const healthController = require('../../../controllers/healthController');
const metricsService = require('../../../services/metricsService');

/**
 * @swagger
 * tags:
 *   name: Monitoring
 *   description: Health checks and metrics endpoints
 */

/**
 * @swagger
 * /api/v1/health/live:
 *   get:
 *     summary: Liveness probe
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', async (req, res) => {
  try {
    await healthController.getLiveness(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/health/ready:
 *   get:
 *     summary: Readiness probe
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service not ready
 */
router.get('/ready', async (req, res) => {
  try {
    await healthController.getReadiness(req, res);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/health/startup:
 *   get:
 *     summary: Startup probe
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Service started successfully
 *       500:
 *         description: Service startup incomplete
 */
router.get('/startup', async (req, res) => {
  try {
    await healthController.getStartup(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Detailed health check
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Detailed health status
 */
router.get('/', async (req, res) => {
  try {
    await healthController.getDetailedHealth(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;