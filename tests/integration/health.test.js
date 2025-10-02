const request = require('supertest');

describe('Health Check Endpoints', () => {
  let app;
  
  beforeAll(() => {
    // Configurar variables de entorno para tests
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key';
    
    // Cargar la aplicación después de configurar el entorno
    app = require('../../server');
  });

  afterAll((done) => {
    // Cerrar conexiones Redis y otros recursos
    const QueueManager = require('../../src/queues/queueConfig');
    const qm = QueueManager.getInstance();
    
    if (qm.initialized) {
      qm.closeAll().then(() => {
        if (app && app.close) {
          app.close(done);
        } else {
          done();
        }
      });
    } else {
      if (app && app.close) {
        app.close(done);
      } else {
        done();
      }
    }
  });

  describe('GET /api/v1/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/api/v1/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return readiness status with checks', async () => {
      const response = await request(app)
        .get('/api/v1/health/ready');
      
      // En ambiente de test, puede ser 200 o 503 dependiendo de las conexiones
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
      expect(response.body.checks).toHaveProperty('queues');
    });

    it('should include correlation ID header', async () => {
      const response = await request(app)
        .get('/api/v1/health/ready');

      expect(response.headers).toHaveProperty('x-correlation-id');
    });
  });

  describe('GET /api/v1/metrics', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/api/v1/metrics')
        .expect(200);

      expect(response.text).toContain('verichain_http_request_duration_seconds');
      expect(response.text).toContain('verichain_http_requests_total');
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });
});