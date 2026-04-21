const jwt = require('jsonwebtoken');
require('dotenv').config();

// We will mock socket.io to capture the registered callbacks for testing
jest.mock('socket.io', () => {
  return {
    Server: jest.fn().mockImplementation(() => {
      return {
        use: jest.fn(),
        on: jest.fn(),
        emit: jest.fn(),
        to: jest.fn().mockReturnThis(),
        adapter: jest.fn()
      };
    })
  };
});
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    duplicate: jest.fn().mockReturnThis(),
    on: jest.fn(),
    connect: jest.fn()
  }));
});
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn()
}));

let initWebSocket, getIO;

describe('Real-Time WebSockets Engine', () => {
  let io;
  let useAuthMiddleware;
  let onConnectionHandler;

  beforeAll(() => {
    jest.resetModules();
    const ws = require('../../src/config/websocket');
    initWebSocket = ws.initWebSocket;
    getIO = ws.getIO;

    // initialize using null server (since we mocked the class)
    io = initWebSocket(null);
    
    // Extract the raw middleware and connection logic
    useAuthMiddleware = io.use.mock.calls[0][0];
    onConnectionHandler = io.on.mock.calls.find(c => c[0] === 'connection')[1];
  });

  describe('WebSocket Authentication Middleware', () => {
    it('should reject connections without a JWT token', () => {
      const socket = { handshake: { auth: {}, headers: {} } };
      const nextFn = jest.fn();

      useAuthMiddleware(socket, nextFn);

      expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
      expect(nextFn.mock.calls[0][0].message).toMatch(/Authentication error/);
    });

    it('should reject connections with an invalid JWT token', () => {
      const socket = { handshake: { auth: { token: 'invalid.token.here' }, headers: {} } };
      const nextFn = jest.fn();

      useAuthMiddleware(socket, nextFn);

      expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
      expect(nextFn.mock.calls[0][0].message).toMatch(/Authentication error/);
    });

    it('should attach user payload to socket on successful authentication', () => {
      const testUser = { id: 'u123', role: 'user' };
      const validToken = jwt.sign(testUser, process.env.JWT_ACCESS_SECRET);
      
      const socket = { handshake: { auth: { token: validToken }, headers: {} } };
      const nextFn = jest.fn();

      useAuthMiddleware(socket, nextFn);

      expect(nextFn).toHaveBeenCalledWith(); // called with undefined on success
      expect(socket.user).toHaveProperty('id', 'u123');
      expect(socket.user).toHaveProperty('role', 'user');
    });
  });

  describe('WebSocket Event Subscriptions', () => {
    it('should auto-join the socket to the correct personal user room on connection', () => {
      const socket = {
        user: { id: 'u123' },
        join: jest.fn()
      };

      onConnectionHandler(socket);

      // Verify strict formatting of the broadcast room
      expect(socket.join).toHaveBeenCalledWith('user:u123');
    });
  });

  describe('Dummy Fallback', () => {
    it('should return a safe dummy object if getIO is heavily invoked before initWebSocket', () => {
      // In a fresh environment, before initWebSocket
      jest.isolateModules(() => {
        const { getIO: isolatedGetIO } = require('../../src/config/websocket');
        const dummy = isolatedGetIO();
        
        expect(dummy).toHaveProperty('emit');
        expect(dummy).toHaveProperty('to');
        expect(() => dummy.emit('test')).not.toThrow();
        expect(() => dummy.to('test').emit('test')).not.toThrow();
      });
    });
  });

});
