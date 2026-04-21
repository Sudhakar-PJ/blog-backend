const request = require('supertest');
const app = require('../../src/app');
const { clearDB } = require('../setup');

describe('Notifications Integration Tests', () => {
  let user1Cookies;
  let user2Cookies;
  let user1Id;
  let user2Id;

  beforeEach(async () => {
    await clearDB();

    // Register User 1
    const reg1 = await request(app).post('/api/v1/auth/register').send({
      email: 'user1@test.com',
      username: 'user1',
      password: 'Password123!'
    });
    user1Id = reg1.body.data.user.id;

    const log1 = await request(app).post('/api/v1/auth/login').send({
      email: 'user1@test.com',
      password: 'Password123!'
    });
    user1Cookies = log1.headers['set-cookie'];

    // Register User 2
    const reg2 = await request(app).post('/api/v1/auth/register').send({
      email: 'user2@test.com',
      username: 'user2',
      password: 'Password123!'
    });
    user2Id = reg2.body.data.user.id;

    const log2 = await request(app).post('/api/v1/auth/login').send({
      email: 'user2@test.com',
      password: 'Password123!'
    });
    user2Cookies = log2.headers['set-cookie'];
  });

  describe('Notification Management', () => {
    let notificationId;

    beforeEach(async () => {
      // Create a notification by having user 2 follow user 1
      await request(app).post(`/api/v1/users/profile/${user1Id}/follow`).set('Cookie', user2Cookies);
      
      const res = await request(app).get('/api/v1/notifications').set('Cookie', user1Cookies);
      notificationId = res.body.data.notifications[0].id;
    });

    it('should fetch notifications for a user', async () => {
      const res = await request(app).get('/api/v1/notifications').set('Cookie', user1Cookies);
      expect(res.status).toBe(200);
      expect(res.body.data.notifications.length).toBeGreaterThan(0);
      expect(res.body.data.notifications[0].actor_username).toBe('user2');
    });

    it('should get correct unread count', async () => {
      const res = await request(app).get('/api/v1/notifications/unread-count').set('Cookie', user1Cookies);
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(1);
    });

    it('should mark a notification as read', async () => {
      const markRes = await request(app).put(`/api/v1/notifications/${notificationId}/read`).set('Cookie', user1Cookies);
      expect(markRes.status).toBe(200);

      const countRes = await request(app).get('/api/v1/notifications/unread-count').set('Cookie', user1Cookies);
      expect(countRes.body.data.count).toBe(0);
    });

    it('should mark all notifications as read', async () => {
      const res = await request(app).put('/api/v1/notifications/read-all').set('Cookie', user1Cookies);
      expect(res.status).toBe(200);

      const countRes = await request(app).get('/api/v1/notifications/unread-count').set('Cookie', user1Cookies);
      expect(countRes.body.data.count).toBe(0);
    });

    it('should aggregate like notifications for the same target', async () => {
      // Setup: Create a post for user 1
      const postRes = await request(app).post('/api/v1/posts').set('Cookie', user1Cookies).send({
        title: 'Notify Me', contentText: 'Text', type: 'text'
      });
      const postId = postRes.body.data.post.id;

      // User 2 likes the post
      await request(app).post(`/api/v1/interactions/posts/${postId}/react`).set('Cookie', user2Cookies).send({ type: 'like' });
      
      const res1 = await request(app).get('/api/v1/notifications').set('Cookie', user1Cookies);
      const count1 = res1.body.data.notifications.length;

      // User 2 un-likes (react again with same type if toggle is implemented)
      // Actually, let's just use another actor or simulate the second hit
      await request(app).post(`/api/v1/interactions/posts/${postId}/react`).set('Cookie', user2Cookies).send({ type: 'like' });
      
      const res2 = await request(app).get('/api/v1/notifications').set('Cookie', user1Cookies);
      // It should NOT have increased since it aggregates/updates the existing one for these types
      expect(res2.body.data.notifications.length).toBe(count1);
    });
  });
});
