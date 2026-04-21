const request = require('supertest');
const app = require('../../src/app');
const { clearDB, pool } = require('../setup');

describe('User Advanced Features Integration', () => {
  let user1Cookies;
  let user2Cookies;
  let user1Id;
  let user2Id;

  beforeEach(async () => {
    await clearDB();

    // Register User 1
    const reg1 = await request(app).post('/api/v1/auth/register').send({
      email: 'user1@test.com', username: 'user1', password: 'Password123!'
    });
    user1Id = reg1.body.data.user.id;

    // Manually promote user 1 to superadmin in DB before login so JWT has it
    await pool.query("UPDATE users SET role = 'superadmin' WHERE id = $1", [user1Id]);

    const log1 = await request(app).post('/api/v1/auth/login').send({
      email: 'user1@test.com', password: 'Password123!'
    });
    user1Cookies = log1.headers['set-cookie'];

    // Register User 2
    const reg2 = await request(app).post('/api/v1/auth/register').send({
      email: 'user2@test.com', username: 'user2', password: 'Password123!'
    });
    user2Id = reg2.body.data.user.id;
    const log2 = await request(app).post('/api/v1/auth/login').send({
      email: 'user2@test.com', password: 'Password123!'
    });
    user2Cookies = log2.headers['set-cookie'];
  });

  describe('Social Discovery', () => {
    it('should list followers and following', async () => {
      // User 2 follows User 1
      await request(app).post(`/api/v1/users/profile/${user1Id}/follow`).set('Cookie', user2Cookies);

      const followersRes = await request(app).get(`/api/v1/users/profile/${user1Id}/followers`).set('Cookie', user1Cookies);
      expect(followersRes.status).toBe(200);
      expect(followersRes.body.data.followers.length).toBe(1);

      const followingRes = await request(app).get(`/api/v1/users/profile/${user2Id}/following`).set('Cookie', user2Cookies);
      expect(followingRes.status).toBe(200);
      expect(followingRes.body.data.following.length).toBe(1);
    });
  });

  describe('Profile & Settings', () => {
    it('should update profile and preferences', async () => {
      const updateRes = await request(app).put('/api/v1/users/profile').set('Cookie', user1Cookies).send({
        fullName: 'New Name', bio: 'New Bio'
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.profile.full_name).toBe('New Name');

      const prefRes = await request(app).put('/api/v1/users/preferences').set('Cookie', user1Cookies).send({
        preferences: ['tech', 'gaming']
      });
      expect(prefRes.status).toBe(200);
      expect(prefRes.body.data.preferences).toContain('tech');
    });

    it('should toggle 2FA', async () => {
      const res = await request(app).post('/api/v1/users/profile/2fa').set('Cookie', user1Cookies).send({
        enabled: true, phoneNumber: '+1234567890'
      });
      expect(res.status).toBe(200);
      expect(res.body.data.user.two_step_enabled).toBe(true);
    });

    it('should handle avatar upload failure if no file', async () => {
        const res = await request(app).post('/api/v1/users/profile/avatar').set('Cookie', user1Cookies);
        expect(res.status).toBe(400);
    });
  });

  describe('Suspensions & RBAC', () => {
    it('should allow admin to suspend user', async () => {
       const res = await request(app).post(`/api/v1/users/${user2Id}/suspend`).set('Cookie', user1Cookies).send({
         action: 'suspend', reason: 'ToS violation'
       });
       expect(res.status).toBe(200);
    });

    it('should fail suspension if reason is missing', async () => {
        const res = await request(app).post(`/api/v1/users/${user2Id}/suspend`).set('Cookie', user1Cookies).send({
          action: 'suspend'
        });
        expect(res.status).toBe(400);
    });
  });
});
