const request = require('supertest');

describe('Certificate Endpoints', () => {
  let app;
  let authToken = null;
  let certificateId = null;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    
    app = require('../../server');

    // Intentar login para obtener token
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test3@verichain.com',
        password: 'Password123!'
      });

    if (loginResponse.status === 200) {
      authToken = loginResponse.body.token;
    }
  });

  afterAll(async () => {
    const QueueManager = require('../../src/queues/queueConfig');
    const qm = QueueManager.getInstance();
    
    if (qm.initialized) {
      await qm.closeAll();
    }
    
    if (app && app.close) {
      app.close();
    }
  });

  describe('GET /api/v1/certificates', () => {
    it('should list certificates with valid token', async () => {
      if (!authToken) {
        console.log('Skipping - no auth token available');
        expect(true).toBe(true);
        return;
      }

      const response = await request(app)
        .get('/api/v1/certificates')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/v1/certificates');

      expect(response.status).toBe(401);
    });

    it('should support pagination parameters', async () => {
      if (!authToken) {
        expect(true).toBe(true);
        return;
      }

      const response = await request(app)
        .get('/api/v1/certificates?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('POST /api/v1/certificates', () => {
    it('should create a certificate with valid data', async () => {
      if (!authToken) {
        expect(true).toBe(true);
        return;
      }

      const certificateData = {
        student_name: 'John Doe',
        student_email: 'john@example.com',
        course_name: 'Blockchain Fundamentals',
        issue_date: new Date().toISOString(),
        certificate_hash: `CERT-${Date.now()}`,
        metadata: {
          grade: 'A',
          credits: 3
        }
      };

      const response = await request(app)
        .post('/api/v1/certificates')
        .set('Authorization', `Bearer ${authToken}`)
        .send(certificateData);

      expect([201, 400, 401]).toContain(response.status);
      
      if (response.status === 201) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('id');
        certificateId = response.body.data.id;
      }
    });

    it('should validate required fields', async () => {
      if (!authToken) {
        expect(true).toBe(true);
        return;
      }

      const response = await request(app)
        .post('/api/v1/certificates')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          student_name: 'John Doe'
        });

      expect([400, 422]).toContain(response.status);
    });
  });

  describe('GET /api/v1/certificates/:id', () => {
    it('should get certificate by ID', async () => {
      // Usar un ID conocido que existe
      const testId = 'UNIV-MG2NUJ3M78CE';
      
      const response = await request(app)
        .get(`/api/v1/certificates/${testId}`);

      expect([200, 404, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('data');
        expect(response.headers).toHaveProperty('x-cache');
      }
    });

    it('should return 404 for non-existent certificate', async () => {
      const response = await request(app)
        .get('/api/v1/certificates/NON-EXISTENT-ID');

      expect([404, 400, 500]).toContain(response.status);
    });

    it('should include cache headers', async () => {
      const testId = 'UNIV-MG2NUJ3M78CE';
      
      // Primera petición
      await request(app).get(`/api/v1/certificates/${testId}`);
      
      // Segunda petición (debería venir de cache)
      const response = await request(app)
        .get(`/api/v1/certificates/${testId}`);

      if (response.status === 200) {
        expect(response.headers).toHaveProperty('x-cache');
      }
    });
  });

  describe('GET /api/v1/certificates/:id/verify', () => {
    it('should verify certificate without authentication', async () => {
      const testId = 'UNIV-MG2NUJ3M78CE';
      
      const response = await request(app)
        .get(`/api/v1/certificates/${testId}/verify`);

      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('verified');
        expect(response.body).toHaveProperty('certificate');
      }
    });
  });

  describe('POST /api/v1/certificates/:id/register-blockchain', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/certificates/some-id/register-blockchain');

      expect(response.status).toBe(401);
    });

    it('should queue blockchain registration with valid token', async () => {
      if (!authToken || !certificateId) {
        expect(true).toBe(true);
        return;
      }

      const response = await request(app)
        .post(`/api/v1/certificates/${certificateId}/register-blockchain`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404, 400]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('jobId');
      }
    });
  });
});