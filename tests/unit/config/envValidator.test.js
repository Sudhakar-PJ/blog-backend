const { validateEnv } = require('../../../src/config/envValidator');

describe('envValidator', () => {
  let originalEnv;
  let exitMock;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    // Mock process.exit
    exitMock = jest.spyOn(process, 'exit').mockImplementation(() => {});
    // Mock console.error/logger
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    exitMock.mockRestore();
    jest.restoreAllMocks();
  });

  it('should pass if all required variables are present', () => {
    process.env.DB_URL = 'postgresql://localhost:5432/test';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'secret2';

    // Should not exit
    validateEnv();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('should exit if required variables are missing', () => {
    delete process.env.DB_URL;
    delete process.env.JWT_ACCESS_SECRET;

    validateEnv();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('should exit if DB_URL is not a valid postgres URI', () => {
    process.env.DB_URL = 'invalid-uri';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'secret2';

    validateEnv();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('should set default values for optional variables', () => {
    process.env.DB_URL = 'postgresql://localhost:5432/test';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'secret2';
    delete process.env.PORT;
    delete process.env.NODE_ENV;

    validateEnv();
    expect(process.env.PORT).toBe(5000);
    expect(process.env.NODE_ENV).toBe('development');
  });
});
