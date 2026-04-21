const request = require('supertest');
const app = require('../../src/app');
const { clearDB } = require('../setup');
const redisClient = require('../../src/config/redis');

describe('Auth Advanced Edge Cases Integration Tests', () => {
  beforeEach(async () => {
    await clearDB();
  });

  describe('Account Lockout Logic', () => {
    it('should lock an account after 5 failed login attempts', async () => {
      // 1. Register a user
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'lockout@example.com',
          username: 'lockoutuser',
          password: 'Password123!'
        });

      // 2. Perform 5 failed logins
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'lockout@example.com',
            password: 'WrongPassword!!'
          });
        expect(res.status).toBe(401);
      }

      // 3. 6th login should return 403 (Account Locked) even with wrong or right password
      const res6 = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'lockout@example.com',
          password: 'Password123!' // Correct password
        });

      expect(res6.status).toBe(403);
      expect(res6.body.error).toMatch(/temporarily locked/i);
    });
  });

  describe('Token Refresh and Session Invalidation', () => {
    it('should refresh a token and then log out to invalidate it', async () => {
      // Register & Login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'refresh@test.com', username: 'refresh', password: 'Password123!' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'refresh@test.com', password: 'Password123!' });

      const cookies = loginRes.headers['set-cookie'];
      const refreshTokenCookie = cookies.find(c => c.startsWith('refreshToken='));
      const deviceIdCookie = cookies.find(c => c.startsWith('deviceId='));
      
      expect(refreshTokenCookie).toBeDefined();
      expect(deviceIdCookie).toBeDefined();

      // Refresh Token
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookies)
        .send();

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data).toHaveProperty('user');
      
      // Obtain the new refresh token from the re-issued cookies
      const newCookies = refreshRes.headers['set-cookie'];
      const newRefreshTokenCookie = newCookies.find(c => c.startsWith('refreshToken='));
      const newRefreshStr = newRefreshTokenCookie.split(';')[0].split('=')[1];
      
      expect(newRefreshStr).toBeDefined();

      // Logout (Invalidates Refresh Tokens in Redis)
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', newCookies)
        .send(); // Needs deviceId to verify refresh token exists

      // Try refreshing with the new refresh token, it should fail
      const failRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', newCookies)
        .send();

      expect(failRefreshRes.status).toBe(401);
      expect(failRefreshRes.body.error).toMatch(/invalid or expired/i);
    });
  });

  describe('Password Change', () => {
    let authCookies;

    beforeEach(async () => {
      // Create unique user for this specific test block
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'change2@test.com', username: 'change2', password: 'OldPassword123!' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'change2@test.com', password: 'OldPassword123!' });
      
      authCookies = loginRes.headers['set-cookie'];
      if (!authCookies) throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
    });

    it('should change password and allow login with new password', async () => {
      const changeRes = await request(app)
        .post('/api/v1/users/profile/change-password')
        .set('Cookie', authCookies)
        .send({
          oldPassword: 'OldPassword123!',
          newPassword: 'NewPassword321!'
        });

      expect(changeRes.status).toBe(200);

      const oldLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'change2@test.com', password: 'OldPassword123!' });
      expect(oldLoginRes.status).toBe(401);

      const newLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'change2@test.com', password: 'NewPassword321!' });
      expect(newLoginRes.status).toBe(200);
    });
  });

  describe('2FA SMS Flow', () => {
    let authCookies;
    let userId;

    beforeEach(async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: '2fa@test.com', username: '2fauser', password: 'Password123!' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: '2fa@test.com', password: 'Password123!' });
      
      authCookies = loginRes.headers['set-cookie'];
      userId = loginRes.body.data.user.id;
    });

    it('should require a 2FA code during login if enabled', async () => {
      // 1. Enable 2FA
      const enableRes = await request(app)
        .post('/api/v1/users/profile/2fa')
        .set('Cookie', authCookies)
        .send({ enabled: true, phoneNumber: '+1234567890' });
      expect(enableRes.status).toBe(200);

      // 2. Logout
      await request(app).post('/api/v1/auth/logout').set('Cookie', authCookies).send();

      // 3. Login again (Should trigger 2FA requirement instead of returning tokens)
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: '2fa@test.com', password: 'Password123!' });
      
      expect(loginRes.status).toBe(202);
      expect(loginRes.body.data).toHaveProperty('requires2FA', true);
      
      // 4. Retrieve mock SMS code directly from Redis
      const code = await redisClient.get(`2fa_code:${userId}`);
      expect(code).toBeDefined();

      // 5. Submit 2FA code
      const verifyRes = await request(app)
        .post('/api/v1/auth/login/2fa')
        .send({ userId, code });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.headers['set-cookie']).toBeDefined(); // Received JWT via cookies
    });
  });

  describe('Account Deactivation and Reactivation', () => {
    let authCookies;
    let userId;

    beforeEach(async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'deactivate@test.com', username: 'deactivator', password: 'Password123!' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'deactivate@test.com', password: 'Password123!' });
      
      authCookies = loginRes.headers['set-cookie'];
      userId = loginRes.body.data.user.id;
    });

    it('should deactivate account and require verification upon next login', async () => {
      // 1. Deactivate
      const deactivateRes = await request(app)
        .post('/api/v1/users/profile/deactivate')
        .set('Cookie', authCookies)
        .send();
      expect(deactivateRes.status).toBe(200);

      // 2. Login again (Should accept password but return tokens with is_email_verified = false)
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'deactivate@test.com', password: 'Password123!' });
      
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.is_email_verified).toBe(false); // Flagged for reactivation

      // 3. Retrieve Reactivation Email Code
      const code = await redisClient.get(`email_verif_code:${userId}`);
      expect(code).toBeDefined();

      // 4. Verify Reactivation Code
      const newCookies = loginRes.headers['set-cookie'];
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .set('Cookie', newCookies)
        .send({ userId, code });

      expect(verifyRes.status).toBe(200);
    });
  });
});
