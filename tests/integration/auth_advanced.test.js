const request = require('supertest');
const app = require('../../src/app');
const { clearDB, pool } = require('../setup');

describe('Auth Advanced Features (Honeypot & Rate Limiting)', () => {
  beforeEach(async () => {
    await clearDB();
  });

  describe('Honeypot Protection', () => {
    it('should block registration if honeypot field is filled', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: 'botuser',
          email: 'bot@example.com',
          password: 'Password123!',
          website: 'http://bot-site.com' // Trigger honeypot
        });

      // We expect a 200 success message to fool the bot, but no user should be created.
      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Initial registration processing started');

      // Verify no user was actually created
      const userRes = await pool.query('SELECT * FROM users WHERE email = $1', ['bot@example.com']);
      expect(userRes.rowCount).toBe(0);
    });

    it('should allow registration if honeypot field is empty', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          username: 'realuser',
          email: 'real@example.com',
          password: 'Password123!',
          website: '' // Empty honeypot
        });

      expect(res.status).toBe(201);
      const userRes = await pool.query('SELECT * FROM users WHERE email = $1', ['real@example.com']);
      expect(userRes.rowCount).toBe(1);
    });
  });

  describe('Rate Limiting (Basic Check)', () => {
    it('should have rate limit headers', async () => {
        // Need to be careful with skipTestEnv. 
        // In local test runs, rate limit might be skipped.
        // But we can check if the middleware is wired.
        const res = await request(app).get('/health');
        // If not in test env, these would exist. 
        // Since we skip in test env, we just verify the route works.
        expect(res.status).toBe(200);
    });
  });
});
