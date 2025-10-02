const router = require('express').Router();
const ErrorTracker = require('../../../services/errorTracker');
const authMiddleware = require('../../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Errors
 *   description: Error tracking and statistics
 */

/**
 * @swagger
 * /api/v1/errors/stats:
 *   get:
 *     summary: Get error statistics (requires authentication)
 *     tags: [Errors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Error statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 correlationId:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalErrors:
 *                       type: number
 *                     byCategory:
 *                       type: object
 *                     topErrors:
 *                       type: array
 *                     recentErrors:
 *                       type: array
 *       401:
 *         description: Unauthorized - Token required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: NO_TOKEN
 *                     message:
 *                       type: string
 *                       example: Authentication required
 */
router.get('/stats', authMiddleware, async (req, res) => {
  const errorTracker = ErrorTracker.getInstance();
  const stats = errorTracker.getErrorStats();
  
  res.json({
    success: true,
    correlationId: req.correlationId,
    data: stats
  });
});

/**
 * @swagger
 * /api/v1/errors/cleanup:
 *   post:
 *     summary: Clean up old error records (requires authentication)
 *     tags: [Errors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               olderThanHours:
 *                 type: number
 *                 default: 24
 *                 description: Delete errors older than this many hours
 *     responses:
 *       200:
 *         description: Cleanup completed
 *       401:
 *         description: Unauthorized
 */
router.post('/cleanup', authMiddleware, async (req, res) => {
  const { olderThanHours = 24 } = req.body;
  const errorTracker = ErrorTracker.getInstance();
  
  errorTracker.cleanup(olderThanHours);
  
  res.json({
    success: true,
    correlationId: req.correlationId,
    message: `Cleaned up errors older than ${olderThanHours} hours`
  });
});

module.exports = router;