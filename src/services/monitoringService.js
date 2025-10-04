const logger = require('../utils/logger');
const redis = require('../config/redis');
const supabaseAdmin = require('./supabaseAdmin');

// Lazy loading para evitar dependencia circular
let socketService;
const getSocketService = () => {
  if (!socketService) {
    try {
      socketService = require('./socketService');
    } catch (error) {
      logger.warn('SocketService not available yet');
    }
  }
  return socketService;
};

class MonitoringService {
  constructor() {
    this.alerts = [];
    this.thresholds = {
      responseTime: 1000,
      errorRate: 0.05,
      memoryUsage: 0.85,
      queueSize: 100
    };
  }

  async checkSystemHealth() {
    const health = {
      timestamp: new Date(),
      services: {},
      alerts: []
    };

    // Database
    try {
      const start = Date.now();
      const { data, error } = await supabaseAdmin.client
        .from('certificates')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      health.services.database = {
        status: 'healthy',
        responseTime: Date.now() - start
      };
    } catch (error) {
      health.services.database = { status: 'unhealthy', error: error.message };
      health.alerts.push('Database connection failed');
    }

    // Redis
    try {
      const start = Date.now();
      await redis.ping();
      health.services.redis = {
        status: 'healthy',
        responseTime: Date.now() - start
      };
    } catch (error) {
      health.services.redis = { status: 'unhealthy', error: error.message };
      health.alerts.push('Redis connection failed');
    }

    // Memory
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed / memUsage.heapTotal;
    health.services.memory = {
      status: heapUsed > this.thresholds.memoryUsage ? 'warning' : 'healthy',
      heapUsed: Math.round(heapUsed * 100) + '%',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
    };

    if (heapUsed > this.thresholds.memoryUsage) {
      health.alerts.push(`High memory usage: ${Math.round(heapUsed * 100)}%`);
    }

    // Si hay alertas, emitirlas por WebSocket
    if (health.alerts.length > 0) {
      logger.error('System health alerts:', health.alerts);
      this.emitHealthAlert(health);
    }

    return health;
  }

  async sendAlerts(alerts) {
    logger.error('CRITICAL ALERTS:', alerts);
    
    try {
      // Guardar en base de datos
      const { data, error } = await supabaseAdmin.client
        .from('system_alerts')
        .insert({
          alerts: alerts,
          severity: this.determineSeverity(alerts),
          created_at: new Date()
        })
        .select()
        .single();

      if (error) throw error;

      // Emitir alerta por WebSocket
      if (alerts && alerts.length > 0) {
        try {
          const socket = getSocketService();
          if (socket && socket.emitAlert) {
            socket.emitAlert({
              id: data?.id,
              severity: this.determineSeverity(alerts),
              alerts,
              source: 'monitoring',
              timestamp: new Date()
            });
            logger.info('Alert emitted via WebSocket');
          }
        } catch (error) {
          logger.error('Error emitting alert via WebSocket:', error);
        }
      }

      return data;
    } catch (error) {
      logger.error('Failed to save alerts:', error);
    }
  }

  determineSeverity(alerts) {
    // Determinar severidad basado en el contenido de las alertas
    const alertText = alerts.join(' ').toLowerCase();
    
    if (alertText.includes('failed') || alertText.includes('error')) {
      return 'critical';
    } else if (alertText.includes('high') || alertText.includes('warning')) {
      return 'high';
    } else if (alertText.includes('degraded')) {
      return 'medium';
    }
    return 'low';
  }

  getPerformanceMetrics() {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();
    
    return {
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        heapUsedPercentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        percentage: this.calculateCPUPercentage(cpuUsage)
      },
      timestamp: new Date()
    };
  }

  calculateCPUPercentage(cpuUsage) {
    // Cálculo aproximado del porcentaje de CPU
    const totalTime = cpuUsage.user + cpuUsage.system;
    const seconds = process.uptime();
    const percentage = (totalTime / 1000000 / seconds) * 100;
    return Math.min(Math.round(percentage * 10) / 10, 100); // Max 100%
  }

  startAutoMonitoring(intervalMinutes = 5) {
    // Monitoreo regular
    setInterval(async () => {
      const health = await this.checkSystemHealth();
      
      if (health.alerts.length > 0) {
        logger.warn('Auto-monitoring detected issues:', health);
        await this.sendAlerts(health.alerts);
      }
      
      // Emitir estado de salud por WebSocket
      try {
        const socket = getSocketService();
        if (socket && socket.emitHealthUpdate) {
          socket.emitHealthUpdate(health);
        }
      } catch (error) {
        logger.error('Error emitting health update:', error);
      }
    }, intervalMinutes * 60 * 1000);
    
    // Métricas cada 30 segundos para WebSocket
    setInterval(() => {
      try {
        const socket = getSocketService();
        if (socket && socket.broadcast) {
          const metrics = this.getPerformanceMetrics();
          socket.broadcast('metrics:auto', metrics);
        }
      } catch (error) {
        // Silencioso, no es crítico
      }
    }, 30000);
    
    logger.info(`Auto-monitoring started (every ${intervalMinutes} minutes)`);
  }

  emitHealthAlert(health) {
    try {
      const socket = getSocketService();
      if (socket && socket.emitAlert) {
        socket.emitAlert({
          type: 'health',
          severity: health.alerts.length > 2 ? 'critical' : 'high',
          alerts: health.alerts,
          services: health.services,
          timestamp: health.timestamp
        });
      }
    } catch (error) {
      logger.error('Error emitting health alert:', error);
    }
  }

  // Método para testing manual
  async testWebSocketAlert() {
    const testAlert = ['WebSocket test alert - ' + new Date().toISOString()];
    await this.sendAlerts(testAlert);
    return { success: true, message: 'Test alert sent via WebSocket' };
  }
}

module.exports = new MonitoringService();