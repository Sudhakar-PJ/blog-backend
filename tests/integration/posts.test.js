const request = require('supertest');
const app = require('../../src/app');
const { clearDB } = require('../setup');

describe('Posts Integration Tests', () => {
  let userCookies;
  let userId;

  beforeEach(async () => {
    await clearDB();
    
    // Register and login to get cookies
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'postauthor@example.com',
        username: 'author',
        password: 'Password123!'
      });
    
    if (regRes.status !== 201) {
      console.error('Registration failed:', regRes.body);
    }

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'postauthor@example.com',
        password: 'Password123!'
      });
    
    userCookies = loginRes.headers['set-cookie'];
    userId = loginRes.body.data.user.id;
  });

  describe('POST /api/v1/posts', () => {
    it('should create a new post successfully', async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Cookie', userCookies)
        .send({
          title: 'Automated Test Post',
          contentText: 'This is a test post content.',
          type: 'text'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.post.title).toBe('Automated Test Post');
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .send({
          title: 'Unauthorized Post',
          contentText: 'Content',
          type: 'text'
        });

      expect(res.status).toBe(401);
    });

    it('should return 400 for missing required fields (Joi validation)', async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Cookie', userCookies)
        .send({
          contentText: 'Missing title',
          type: 'text'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should parse form-data and simulate Cloudinary media upload', async () => {
      // Simulate creating a dummy image file
      const fs = require('fs');
      const dummyPath = './dummy_test_image.jpg';
      fs.writeFileSync(dummyPath, 'fake image content');

      const res = await request(app)
        .post('/api/v1/posts')
        .set('Cookie', userCookies)
        .field('title', 'Media Post')
        .field('contentText', 'Look at this mock image')
        .field('type', 'image')
        .attach('media', dummyPath);

      // Cleanup
      if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);

      expect(res.status).toBe(201);
      expect(res.body.data.post.media_urls.length).toBe(1);
      expect(res.body.data.post.media_urls[0]).toMatch(/test-mock/);
    });
  });

  describe('DELETE /api/v1/posts/:id', () => {
    let postId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/posts')
        .set('Cookie', userCookies)
        .send({ title: 'To Be Deleted', contentText: 'Content', type: 'text' });
      postId = res.body.data.post.id;
    });

    it('should delete own post successfully', async () => {
      const res = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Cookie', userCookies);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 if non-author attempts to delete the post', async () => {
      // Create second user
      await request(app).post('/api/v1/auth/register').send({ email: 'hacker@example.com', username: 'hacker', password: 'Password123!' });
      const loginRes = await request(app).post('/api/v1/auth/login').send({ email: 'hacker@example.com', password: 'Password123!' });
      const hackerCookies = loginRes.headers['set-cookie'];

      const res = await request(app)
        .delete(`/api/v1/posts/${postId}`)
        .set('Cookie', hackerCookies);
      
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/permission denied/i);
    });
  });

  describe('GET /api/v1/posts/feed', () => {
    it('should fetch the feed and support cursor-based pagination', async () => {
      // Create another user to follow, or just create posts
      // A user's feed (discovery/mix) should show other users' posts
      // For simplicity in this test, we verify we can get non-empty results if we create some posts
      
      // Setup: Create 3 posts from a different user
      const otherUser = await request(app).post('/api/v1/auth/register').send({ email: 'other@example.com', username: 'other', password: 'Password123!' });
      const otherLogin = await request(app).post('/api/v1/auth/login').send({ email: 'other@example.com', password: 'Password123!' });
      const otherCookies = otherLogin.headers['set-cookie'];

      for (let i = 1; i <= 3; i++) {
        await request(app).post('/api/v1/posts').set('Cookie', otherCookies).send({
          title: `Post ${i}`,
          contentText: `Content ${i}`,
          type: 'text'
        });
        // Increased delay for absolute timestamp precision in shared test environments
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Test: Fetch feed with limit 2
      const res = await request(app)
        .get('/api/v1/posts/feed?limit=2')
        .set('Cookie', userCookies);

      expect(res.status).toBe(200);
      // We expect 2 posts because otherUser created 3 and they are not author's own posts.
      expect(res.body.data.posts.length).toBe(2);

      const nextRes = await request(app)
        .get(`/api/v1/posts/feed?limit=2&cursor=${res.body.data.nextCursor}`)
        .set('Cookie', userCookies);

      expect(nextRes.status).toBe(200);
      expect(nextRes.body.data.posts.length).toBe(1); // The leftover 3rd post
      expect(nextRes.body.data.nextCursor).toBeNull(); // No more posts
    });
  });

  describe('GET Post Discovery and Auxiliary Endpoints', () => {
    it('should successfully fetch user authored posts via /me', async () => {
      const res = await request(app).get('/api/v1/posts/me').set('Cookie', userCookies);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.posts)).toBe(true);
    });

    it('should query posts by a specific user id', async () => {
      const res = await request(app).get(`/api/v1/posts/user/${userId}`).set('Cookie', userCookies);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.posts)).toBe(true);
    });

    it('should search posts successfully based on query string', async () => {
      // Setup: Create a searchable post
      await request(app).post('/api/v1/posts').set('Cookie', userCookies)
        .send({ title: 'MagicKeyword', contentText: 'Hidden treasure here', type: 'text' });
      
      const res = await request(app).get('/api/v1/posts/search?q=MagicKeyword').set('Cookie', userCookies);
      expect(res.status).toBe(200);
      expect(res.body.data.posts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Post Interactions Auxiliary Fetch', () => {
    it('should be able to fetch liked posts', async () => {
      const res = await request(app).get('/api/v1/posts/liked').set('Cookie', userCookies);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.posts)).toBe(true);
    });

    it('should be able to fetch bookmarked posts', async () => {
      const res = await request(app).get('/api/v1/posts/bookmarked').set('Cookie', userCookies);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.posts)).toBe(true);
    });
  });
});
