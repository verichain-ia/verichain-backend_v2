const metricsService = require('../services/metricsService');

function metricsMiddleware(req, res, next) {
  const start = Date.now();
  const metrics = metricsService.getInstance();

  // Interceptar el final de la respuesta
  const originalSend = res.send;
  res.send = function(data) {
    // Calcular duración
    const duration = (Date.now() - start) / 1000;
    
    // Obtener la ruta limpia (sin IDs específicos)
    const route = req.route ? req.route.path : req.path;
    const cleanRoute = route
      .replace(/\/[a-f0-9-]{36}/gi, '/:id')  // UUIDs
      .replace(/\/\d+/g, '/:id')             // Números
      .replace(/\/[A-Z]+-[A-Z0-9]+/g, '/:id'); // IDs tipo UNIV-XXXX

    // Registrar métrica
    metrics.recordHttpRequest(
      req.method,
      cleanRoute,
      res.statusCode,
      duration
    );

    // Llamar al send original
    originalSend.call(this, data);
  };

  next();
}

module.exports = metricsMiddleware;