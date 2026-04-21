const request = require('supertest');
const app = require('../../src/app');
const { clearDB, pool } = require('../setup');
const redisClient = require('../../src/config/redis');

describe('Admin Integration Tests', () => {
  let superCookies;

  beforeEach(async () => {
    await clearDB();

    // Create a superadmin
    await request(app).post('/api/v1/auth/register').send({
      email: 'admin@test.com',
      username: 'admin',
      password: 'Password123!'
    });

    // Manually promote to superadmin in DB
    await pool.query("UPDATE users SET role = 'superadmin' WHERE email = 'admin@test.com'");

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@test.com',
      password: 'Password123!'
    });
    superCookies = loginRes.headers['set-cookie'];
  });

  it('should fetch all users for superadmin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', superCookies);
    
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(0);
  });

  it('should fetch all posts for superadmin', async () => {
    // Create a post first
    await request(app).post('/api/v1/posts').set('Cookie', superCookies).send({
      title: 'Admin Post', contentText: 'Text', type: 'text'
    });

    const res = await request(app)
      .get('/api/v1/admin/posts')
      .set('Cookie', superCookies);
    
    expect(res.status).toBe(200);
    expect(res.body.data.posts.length).toBeGreaterThan(0);
  });

  it('should fetch system logs from Postgres', async () => {
    // Manually insert a log to test
    await pool.query("INSERT INTO logs.app_logs (level, message, meta) VALUES ('warn', 'Test Log', '{\"requestId\": \"req-123\"}')");

    const res = await request(app)
      .get('/api/v1/admin/logs')
      .set('Cookie', superCookies);
    
    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBeGreaterThan(0);
  });

  it('should fetch server errors from Postgres', async () => {
    // Manually insert an error
    await pool.query("INSERT INTO logs.server_errors (message, stack_trace, meta) VALUES ('Test Error', 'Stack', '{\"requestId\": \"req-456\"}')");

    const res = await request(app)
      .get('/api/v1/admin/server-errors')
      .set('Cookie', superCookies);
    
    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
  });

  it('should fetch hot logs from Redis', async () => {
    const today = new Date().toISOString().split('T')[0];
    const keyName = `logs:info:${today}`;
    await redisClient.rpush(keyName, JSON.stringify({ message: 'Hot Log', requestId: 'hot-1' }));

    const res = await request(app)
      .get('/api/v1/admin/logs/hot')
      .set('Cookie', superCookies);
    
    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBeGreaterThan(0);
    expect(res.body.data.logs.some(l => l.message === 'Hot Log')).toBe(true);
  });

  it('should search logs across tiers by requestId', async () => {
    const rid = 'search-req-789';
    await pool.query("INSERT INTO logs.app_logs (level, message, meta) VALUES ('warn', 'DB Log', $1)", [JSON.stringify({ requestId: rid })]);
    
    const today = new Date().toISOString().split('T')[0];
    await redisClient.rpush(`logs:info:${today}`, JSON.stringify({ message: 'Redis Log', requestId: rid, timestamp: new Date() }));

    const res = await request(app)
      .get(`/api/v1/admin/logs/search?requestId=${rid}`)
      .set('Cookie', superCookies);
    
    expect(res.status).toBe(200);
    const messages = res.body.data.logs.map(l => l.message);
    expect(messages).toContain('DB Log');
    expect(messages).toContain('Redis Log');
  });

  it('should return 403 for non-admins', async () => {
     // Create a normal user
     await request(app).post('/api/v1/auth/register').send({
      email: 'user@test.com',
      username: 'user',
      password: 'Password123!'
    });
    const logRes = await request(app).post('/api/v1/auth/login').send({
      email: 'user@test.com',
      password: 'Password123!'
    });
    const userCookies = logRes.headers['set-cookie'];

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', userCookies);
    
    expect(res.status).toBe(403);
  });
});
