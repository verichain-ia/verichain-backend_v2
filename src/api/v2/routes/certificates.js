const router = require('express').Router();
const v1CertificatesRouter = require('../../v1/routes/certificates');
const { apiCache } = require('../../../middleware/cache');

/**
 * @swagger
 * tags:
 *   name: Certificates (v2)
 *   description: Certificate management with caching and enhanced features
 */

// v2 usa las mismas rutas de v1 pero agrega caching en GET
router.use('/', (req, res, next) => {
  // Agregar cache solo para métodos GET
  if (req.method === 'GET' && !req.path.includes('verify')) {
    return apiCache('5 minutes')(req, res, () => {
      v1CertificatesRouter(req, res, next);
    });
  }
  
  // Para otros métodos, usar v1 directamente
  v1CertificatesRouter(req, res, next);
});

// v2 exclusive features (futuras)
router.post('/batch/create', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Batch creation coming in v2.1'
  });
});

module.exports = router;