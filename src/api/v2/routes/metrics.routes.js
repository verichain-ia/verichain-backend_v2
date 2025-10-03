const express = require('express');
const router = express.Router();
const metricsController = require('../../../controllers/metricsController');

/**
 * @swagger
 * /metrics/dashboard:
 *   get:
 *     summary: Get dashboard metrics
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Dashboard metrics
 */
router.get('/dashboard', metricsController.getDashboardMetrics);

/**
 * @swagger
 * /metrics/certificates:
 *   get:
 *     summary: Get certificate metrics
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Certificate metrics
 */
router.get('/certificates', metricsController.getCertificateMetrics);

/**
 * @swagger
 * /metrics/organizations:
 *   get:
 *     summary: Get organization metrics
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Organization metrics
 */
router.get('/organizations', metricsController.getOrganizationMetrics);

/**
 * @swagger
 * /metrics/verifications:
 *   get:
 *     summary: Get verification metrics
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Verification metrics
 */
router.get('/verifications', metricsController.getVerificationMetrics);

module.exports = router;