const client = require('prom-client');

class MetricsService {
  constructor() {
    // Crear registro
    this.register = new client.Registry();
    
    // Agregar métricas default (CPU, memoria, etc)
    client.collectDefaultMetrics({ 
      register: this.register,
      prefix: 'verichain_'
    });

    // Métricas HTTP
    this.httpRequestDuration = new client.Histogram({
      name: 'verichain_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5]
    });

    this.httpRequestTotal = new client.Counter({
      name: 'verichain_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });

    // Métricas de Cache
    this.cacheHits = new client.Counter({
      name: 'verichain_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type']
    });

    this.cacheMisses = new client.Counter({
      name: 'verichain_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type']
    });

    // Métricas de Queue
    this.queueJobsProcessed = new client.Counter({
      name: 'verichain_queue_jobs_processed_total',
      help: 'Total number of queue jobs processed',
      labelNames: ['queue_name', 'status']
    });

    this.queueJobDuration = new client.Histogram({
      name: 'verichain_queue_job_duration_seconds',
      help: 'Duration of queue job processing',
      labelNames: ['queue_name'],
      buckets: [1, 5, 10, 30, 60, 120]
    });

    // Métricas de Database
    this.dbQueryDuration = new client.Histogram({
      name: 'verichain_db_query_duration_seconds',
      help: 'Duration of database queries',
      labelNames: ['operation', 'table'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1]
    });

    // Métricas de Blockchain
    this.blockchainOperations = new client.Counter({
      name: 'verichain_blockchain_operations_total',
      help: 'Total blockchain operations',
      labelNames: ['operation', 'status']
    });

    // Métricas de Negocio
    this.certificatesCreated = new client.Counter({
      name: 'verichain_certificates_created_total',
      help: 'Total certificates created'
    });

    this.verificationsPerformed = new client.Counter({
      name: 'verichain_verifications_performed_total',
      help: 'Total certificate verifications'
    });

    // Registrar todas las métricas
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.cacheHits);
    this.register.registerMetric(this.cacheMisses);
    this.register.registerMetric(this.queueJobsProcessed);
    this.register.registerMetric(this.queueJobDuration);
    this.register.registerMetric(this.dbQueryDuration);
    this.register.registerMetric(this.blockchainOperations);
    this.register.registerMetric(this.certificatesCreated);
    this.register.registerMetric(this.verificationsPerformed);
  }

  // Método para obtener todas las métricas
  async getMetrics() {
    return this.register.metrics();
  }

  // Helpers para registrar métricas
  recordHttpRequest(method, route, statusCode, duration) {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );
    this.httpRequestTotal.inc({ 
      method, 
      route, 
      status_code: statusCode 
    });
  }

  recordCacheHit(cacheType) {
    this.cacheHits.inc({ cache_type: cacheType });
  }

  recordCacheMiss(cacheType) {
    this.cacheMisses.inc({ cache_type: cacheType });
  }

  recordQueueJob(queueName, status, duration = null) {
    this.queueJobsProcessed.inc({ queue_name: queueName, status });
    if (duration) {
      this.queueJobDuration.observe({ queue_name: queueName }, duration);
    }
  }

  recordDbQuery(operation, table, duration) {
    this.dbQueryDuration.observe({ operation, table }, duration);
  }

  recordBlockchainOperation(operation, status) {
    this.blockchainOperations.inc({ operation, status });
  }

  incrementCertificatesCreated() {
    this.certificatesCreated.inc();
  }

  incrementVerifications() {
    this.verificationsPerformed.inc();
  }
}

// Singleton
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new MetricsService();
    }
    return instance;
  }
};