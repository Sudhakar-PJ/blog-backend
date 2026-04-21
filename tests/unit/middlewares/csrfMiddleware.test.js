const { csrfProtection } = require('../../../src/middlewares/csrfMiddleware');
const ApiResponse = require('../../../src/utils/apiResponse');

describe('csrfMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    req = {
      cookies: {},
      headers: {},
      method: 'GET',
      originalUrl: '/test',
      ip: '127.0.0.1'
    };
    res = {
      cookie: jest.fn(),
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
    process.env.NODE_ENV = 'test';
    jest.restoreAllMocks();
  });

  it('should pass GET requests and set a cookie if missing', () => {
    csrfProtection(req, res, next);
    expect(res.cookie).toHaveBeenCalledWith('csrf-token', expect.any(String), expect.any(Object));
    expect(next).toHaveBeenCalled();
  });

  it('should pass POST request if tokens match', () => {
    const token = 'test-token';
    req.method = 'POST';
    req.cookies['csrf-token'] = token;
    req.headers['x-csrf-token'] = token;

    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should fail POST request if x-csrf-token header is missing', () => {
    req.method = 'POST';
    req.cookies['csrf-token'] = 'token-in-cookie';
    // No header

    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should fail POST request if tokens do not match', () => {
    req.method = 'POST';
    req.cookies['csrf-token'] = 'token-a';
    req.headers['x-csrf-token'] = 'token-b';

    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
