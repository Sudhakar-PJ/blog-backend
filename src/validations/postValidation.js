const Joi = require('joi');

const createPost = {
  body: Joi.object().keys({
    title: Joi.string().required().min(5).max(255),
    type: Joi.string().required().valid('text', 'image', 'video'),
    contentText: Joi.string().required(),
    mediaUrls: Joi.array().items(Joi.string().uri()).optional(),
    categoryName: Joi.string().optional()
  })
};

const getPost = {
  params: Joi.object().keys({
    id: Joi.string().required().uuid()
  })
};

const deletePost = {
  params: Joi.object().keys({
    postId: Joi.string().required().uuid()
  })
};

const genericPagination = {
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(100).default(20),
    cursor: Joi.string().optional(),
    offset: Joi.number().integer().min(0).optional()
  })
};

const userPosts = {
  params: Joi.object().keys({
    userId: Joi.string().required().uuid()
  }),
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(100).default(20),
    cursor: Joi.string().optional()
  })
};

const searchQuery = {
  query: Joi.object().keys({
    q: Joi.string().required(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    cursor: Joi.string().optional()
  })
};

const getFeed = {
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(100).default(20),
    cursor: Joi.string().optional()
  })
};

module.exports = {
  createPost,
  getPost,
  deletePost,
  genericPagination,
  userPosts,
  searchQuery,
  getFeed
};
