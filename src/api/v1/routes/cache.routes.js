// src/api/v1/routes/cache.routes.js
const router = require('express').Router();
const { protect } = require('../../../middleware/auth');
const cacheService = require('../../../services/cacheService');
const ResponseFormatter = require('../../../middleware/responseFormatter');

/**
 * @swagger
 * /api/v1/cache/stats:
 *   get:
 *     summary: Get cache statistics
 *     tags: [Cache]
 *     description: Returns current cache statistics including hit rate, memory usage, and key count
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     hits:
 *                       type: integer
 *                       example: 245
 *                     misses:
 *                       type: integer
 *                       example: 45
 *                     keys:
 *                       type: integer
 *                       example: 28
 *                     hitRate:
 *                       type: string
 *                       example: "84.48%"
 *                     memory:
 *                       type: object
 *                       properties:
 *                         used:
 *                           type: string
 *                           example: "2.45 MB"
 *                         limit:
 *                           type: string
 *                           example: "512 MB"
 *       401:
 *         description: Unauthorized - No token provided
 *       500:
 *         description: Internal server error
 */
router.get('/stats', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin only'
      });
    }

    const stats = await cacheService.getStats();
    ResponseFormatter.success(res, stats);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/cache/flush:
 *   post:
 *     summary: Flush all cache
 *     tags: [Cache]
 *     security:
 *       - bearerAuth: []
 */
router.post('/flush', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin only'
      });
    }

    const count = await cacheService.flush();
    ResponseFormatter.success(res, {
      message: `Flushed ${count} cache entries`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/cache/invalidate:
 *   post:
 *     summary: Invalidate cache by pattern
 *     tags: [Cache]
 */
router.post('/invalidate', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin only'
      });
    }

    const { pattern } = req.body;
    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'Pattern required'
      });
    }

    const count = await cacheService.invalidate(pattern);
    ResponseFormatter.success(res, {
      message: `Invalidated ${count} cache entries`
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;