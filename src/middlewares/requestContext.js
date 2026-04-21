const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const asyncLocalStorage = new AsyncLocalStorage();

const requestContextMiddleware = (req, res, next) => {
  const requestId = crypto.randomUUID();
  req.id = requestId;

  // Set header for client-side correlation
  res.setHeader('X-Request-ID', requestId);

  const store = new Map();
  store.set('requestId', requestId);

  asyncLocalStorage.run(store, () => {
    next();
  });
};

module.exports = {
  asyncLocalStorage,
  requestContextMiddleware
};
