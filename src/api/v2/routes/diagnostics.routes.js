const express = require('express');
const { protect } = require('../../../middleware/auth');
const router = express.Router();
const os = require('os');
const supabaseService = require('../../../services/supabaseService');
const CircuitBreakerFactory = require('../../../middleware/circuitBreaker');

// Health check básico
router.get('/health', async (req, res) => {
  try {
    // Test database connection
    const { data, error } = await supabaseService.supabase
      .from('certificates')
      .select('count')
      .limit(1);
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: error ? 'disconnected' : 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// System info - protegido
router.get('/system', protect, async (req, res) => {
  res.json({
    success: true,
    system: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      nodeVersion: process.version,
      uptime: `${(process.uptime() / 60 / 60).toFixed(2)} hours`
    }
  });
});

// Database status - protegido
router.get('/database', protect, async (req, res) => {
  try {
    const { data: certificates } = await supabaseService.supabase
      .from('certificates')
      .select('count');
    
    const { data: organizations } = await supabaseService.supabase
      .from('organizations')
      .select('count');
    
    const { data: users } = await supabaseService.supabase
      .from('users')
      .select('count');
    
    res.json({
      success: true,
      database: {
        status: 'connected',
        tables: {
          certificates: certificates?.length || 0,
          organizations: organizations?.length || 0,
          users: users?.length || 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: {
        status: 'error',
        error: error.message
      }
    });
  }
});

// Blockchain status
router.get('/blockchain', async (req, res) => {
  try {
    const PaseoService = require('../../../services/blockchain/PaseoService');
    const status = PaseoService.getStatus();
    
    res.json({
      success: true,
      blockchain: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      blockchain: {
        connected: false,
        error: error.message
      }
    });
  }
});

// Metrics - protegido
router.get('/metrics', protect, async (req, res) => {
  try {
    const metrics = await supabaseService.getMetrics();
    
    res.json({
      success: true,
      metrics: {
        certificates: metrics,
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/circuit-breakers', protect, (req, res) => {
  // Solo admin puede ver estadísticas
  if (req.user.role !== 'super_admin' && req.user.role !== 'org_admin') {
    return res.status(403).json({
      success: false,
      error: 'Insufficient permissions'
    });
  }
  
  const stats = CircuitBreakerFactory.getStats();
  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString()
  });
});

// Reset circuit breaker específico
router.post('/circuit-breakers/:name/reset', protect, (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Only super admins can reset circuit breakers'
    });
  }
  
  const { name } = req.params;
  const result = CircuitBreakerFactory.reset(name);
  
  res.json({
    success: result,
    message: result ? `Circuit breaker ${name} reset successfully` : `Circuit breaker ${name} not found`
  });
});

// Reset todos los circuit breakers
router.post('/circuit-breakers/reset-all', protect, (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Only super admins can reset circuit breakers'
    });
  }
  
  CircuitBreakerFactory.resetAll();
  
  res.json({
    success: true,
    message: 'All circuit breakers reset successfully'
  });
});

module.exports = router;