module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/loadEnv.js'],
  setupFilesAfterEnv: ['./tests/setup.js'],
  globalTeardown: './tests/teardown.js',
  maxWorkers: 1,
  testTimeout: 30000,
  bail: false,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'json', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/src/config/swagger.js',
    '/src/config/redis.js',
    '/src/config/db.js'
  ],
  testMatch: ['**/tests/**/*.test.js'],
};
