const request = require('supertest');
const app = require('../../src/app');
const { clearDB } = require('../setup');

describe('Social Interactions Integration Tests', () => {
  let authorCookies, authorId;
  let likerCookies, likerId;
  let postId;

  beforeEach(async () => {
    await clearDB();
    
    // Register Author
    const authorReg = await request(app).post('/api/v1/auth/register').send({ email: 'author@test.com', username: 'author', password: 'Password123!' });
    const authorLog = await request(app).post('/api/v1/auth/login').send({ email: 'author@test.com', password: 'Password123!' });
    authorCookies = authorLog.headers['set-cookie'];
    authorId = authorLog.body.data.user.id;

    // Register Liker/Commenter
    const likerReg = await request(app).post('/api/v1/auth/register').send({ email: 'liker@test.com', username: 'liker', password: 'Password123!' });
    const likerLog = await request(app).post('/api/v1/auth/login').send({ email: 'liker@test.com', password: 'Password123!' });
    likerCookies = likerLog.headers['set-cookie'];
    likerId = likerLog.body.data.user.id;

    // Create a Post
    const postRes = await request(app)
      .post('/api/v1/posts')
      .set('Cookie', authorCookies)
      .send({ title: 'Interaction Target', contentText: 'Content', type: 'text' });
    if (!postRes.body.data) {
      console.log('CREATE POST FAILED:', postRes.status, postRes.body);
    }
    postId = postRes.body.data.post.id;
  });

  describe('Anti-Self-Interaction Security', () => {
    it('should prohibit author from liking their own post', async () => {
      const res = await request(app)
        .post(`/api/v1/interactions/post/${postId}/react`)
        .set('Cookie', authorCookies)
        .send({ type: 'like' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot like/i);
    });

    it('should prohibit author from bookmarking their own post', async () => {
      const res = await request(app).post(`/api/v1/interactions/posts/${postId}/bookmark`).set('Cookie', authorCookies);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot bookmark/i);
    });

    it('should prohibit author from top-level commenting on their own post', async () => {
      const res = await request(app)
        .post(`/api/v1/interactions/posts/${postId}/comments`)
        .set('Cookie', authorCookies)
        .send({ text: 'Self comment' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/cannot leave a top-level parent comment/i);
    });
  });

  describe('Engagement Counters and Toggles', () => {
    it('should toggle like status and update counter', async () => {
      // Like
      const likeRes = await request(app)
        .post(`/api/v1/interactions/post/${postId}/react`)
        .set('Cookie', likerCookies)
        .send({ type: 'like' });
      expect(likeRes.status).toBe(200);
      expect(likeRes.body.data.result.action).toBe('added'); // Correct assertion string dynamically

      // Verify Counter
      const postState1 = await request(app).get(`/api/v1/posts/feed`).set('Cookie', likerCookies);
      expect(postState1.body.data.posts.find(p => p.id === postId).likes_count).toBe("1"); 

      // Unlike
      const unlikeRes = await request(app)
        .post(`/api/v1/interactions/post/${postId}/react`)
        .set('Cookie', likerCookies)
        .send({ type: 'like' }); 
      
      expect(unlikeRes.status).toBe(200);
      expect(unlikeRes.body.data.result.action).toBe('removed');
      
      // Verify Counter
      const postState2 = await request(app).get(`/api/v1/posts/feed`).set('Cookie', likerCookies);
      expect(postState2.body.data.posts.find(p => p.id === postId).likes_count).toBe("0");
    });
  });

  describe('Nested Replies', () => {
    it('should allow nested replies and allow author to reply to comments', async () => {
      // Liker leaves a top-level comment
      const commentRes = await request(app)
        .post(`/api/v1/interactions/posts/${postId}/comments`)
        .set('Cookie', likerCookies)
        .send({ text: 'Great post!' });
      
      expect(commentRes.status).toBe(201);
      const parentCommentId = commentRes.body.data.comment.id;

      // Author replies to the liker's comment (which is allowed)
      const replyRes = await request(app)
        .post(`/api/v1/interactions/posts/${postId}/comments`)
        .set('Cookie', authorCookies)
        .send({ text: 'Thank you!', parentId: parentCommentId });
      
      expect(replyRes.status).toBe(201);
      expect(replyRes.body.data.comment.parent_id).toBe(parentCommentId);

      // Verify the thread fetch
      const threadRes = await request(app)
        .get(`/api/v1/interactions/posts/${postId}/comments`)
        .set('Cookie', likerCookies);
      expect(threadRes.status).toBe(200);
      const fetchedParent = threadRes.body.data.comments.find(c => c.id === parentCommentId);
      expect(fetchedParent).toBeDefined();
    });
  });
});
