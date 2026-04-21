const Joi = require('joi');
const validate = require('../../../src/middlewares/validate');
const ApiResponse = require('../../../src/utils/apiResponse');

describe('validate middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      query: {},
      method: 'POST',
      originalUrl: '/test'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    
    // Mock ApiResponse.error
    jest.spyOn(ApiResponse, 'error').mockImplementation((res, msg, status) => {
        return res.status(status).json({ success: false, error: msg });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call next if validation passes', () => {
    const schema = {
      body: Joi.object({
        name: Joi.string().required()
      })
    };
    req.body = { name: 'Test' };

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.name).toBe('Test');
  });

  it('should return 400 if validation fails', () => {
    const schema = {
      body: Joi.object({
        name: Joi.string().required()
      })
    };
    req.body = { }; // Missing name

    validate(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should strip unknown fields', () => {
    const schema = {
      body: Joi.object({
        name: Joi.string().required()
      })
    };
    req.body = { name: 'Test', isAdmin: true }; // isAdmin not in schema

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.isAdmin).toBeUndefined();
    expect(req.body.name).toBe('Test');
  });

  it('should validate params and query as well', () => {
    const schema = {
      params: Joi.object({
        id: Joi.number().required()
      }),
      query: Joi.object({
        search: Joi.string().required()
      })
    };
    req.params = { id: '123' };
    req.query = { search: 'query' };

    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.params.id).toBe(123); // Coerced to number
  });
});
