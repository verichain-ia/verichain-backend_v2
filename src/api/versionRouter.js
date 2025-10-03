const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * API Version Router
 * Manages different API versions with proper deprecation headers
 */

// Version middleware factory
const versionMiddleware = (version, options = {}) => {
  return (req, res, next) => {
    // Set version header
    res.setHeader('API-Version', version);
    res.setHeader('X-API-Version', version);
    
    // Deprecation headers if applicable
    if (options.deprecated) {
      res.setHeader('Sunset', options.sunsetDate || '2026-01-01');
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', `</api/v${options.successorVersion}>; rel="successor-version"`);
      
      // Log deprecation warning
      logger.warn(`Deprecated API version ${version} called: ${req.method} ${req.path}`);
    }
    
    // Add version to request for tracking
    req.apiVersion = version;
    
    next();
  };
};

// Import version routers
const v1Routes = require('./v1/routes');
const v2Routes = require('./v2/routes');

// Mount v1 routes (current stable)
router.use('/v1', versionMiddleware('1.0.0', {
  deprecated: false,
  successorVersion: 2
}), v1Routes);

// Mount v2 routes (next version)
router.use('/v2', versionMiddleware('2.0.0', {
  deprecated: false
}), v2Routes);

// Default to v1 for backward compatibility
router.use('/', versionMiddleware('1.0.0', {
  deprecated: false,
  note: 'Using default v1. Specify version explicitly.'
}), v1Routes);

/**
 * @swagger
 * /api/versions:
 *   get:
 *     summary: Get API version information
 *     tags: [Versioning]
 *     description: Returns information about available API versions, deprecation status, and links
 *     responses:
 *       200:
 *         description: API version information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 current:
 *                   type: string
 *                   description: Current recommended API version
 *                   example: "1.0.0"
 *                 supported:
 *                   type: array
 *                   description: List of supported API versions
 *                   items:
 *                     type: string
 *                   example: ["1.0.0", "2.0.0"]
 *                 deprecated:
 *                   type: array
 *                   description: List of deprecated API versions
 *                   items:
 *                     type: string
 *                   example: []
 *                 sunset:
 *                   type: object
 *                   description: Sunset dates for deprecated versions
 *                   example: {}
 *                 links:
 *                   type: object
 *                   properties:
 *                     v1:
 *                       type: string
 *                       example: "/api/v1"
 *                     v2:
 *                       type: string
 *                       example: "/api/v2"
 *                     documentation:
 *                       type: string
 *                       example: "/api-docs"
 */

// Version info endpoint
router.get('/versions', (req, res) => {
  res.json({
    current: '1.0.0',
    supported: ['1.0.0', '2.0.0'],
    deprecated: [],
    sunset: {},
    links: {
      v1: '/api/v1',
      v2: '/api/v2',
      documentation: '/api-docs'
    }
  });
});

module.exports = router;
