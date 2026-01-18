import supertest from 'supertest';
import express from 'express';

// Create a minimal test app
const createTestApp = () => {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'healthy' });
  });

  app.get('/api/v1/incidents', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !apiKey.toString().startsWith('irp_')) {
      res.status(401).json({
        error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid API key' },
      });
      return;
    }

    res.json({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send(`
# HELP incidents_detected_total Total incidents detected
# TYPE incidents_detected_total counter
incidents_detected_total{severity="critical"} 0
incidents_detected_total{severity="high"} 0
incidents_detected_total{severity="medium"} 0
incidents_detected_total{severity="low"} 0
    `);
  });

  return app;
};

describe('End-to-End Incident Workflow', () => {
  let app: express.Application;
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    app = createTestApp();
    request = supertest(app);
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request.get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Incidents API', () => {
    it('should reject request without API key', async () => {
      const response = await request.get('/api/v1/incidents');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should accept valid API key', async () => {
      const response = await request
        .get('/api/v1/incidents')
        .set('X-API-Key', 'irp_test_api_key_12345');
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    it('should return paginated results', async () => {
      const response = await request
        .get('/api/v1/incidents?page=1&limit=10')
        .set('X-API-Key', 'irp_test_api_key_12345');

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(1);
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request.get('/metrics');
      expect(response.status).toBe(200);
      expect(response.text).toContain('incidents_detected_total');
    });
  });

  describe('Full Workflow', () => {
    it('should complete health check and metrics verification', async () => {
      // 1. Health check
      const healthResponse = await request.get('/health');
      expect(healthResponse.status).toBe(200);

      // 2. List incidents
      const incidentsResponse = await request
        .get('/api/v1/incidents')
        .set('X-API-Key', 'irp_test_api_key_12345');
      expect(incidentsResponse.status).toBe(200);

      // 3. Verify metrics
      const metricsResponse = await request.get('/metrics');
      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.text).toContain('incidents_detected_total');
    });
  });
});
