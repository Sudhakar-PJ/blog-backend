const AuthService = require('../../src/services/AuthService');
const UserRepository = require('../../src/repositories/UserRepository');
const VerificationService = require('../../src/services/VerificationService');
const redisClient = require('../../src/config/redis');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');

jest.mock('../../src/repositories/UserRepository');
jest.mock('../../src/services/VerificationService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({}),
  sendVerificationSMS: jest.fn().mockResolvedValue({}),
  sendNewPasswordEmail: jest.fn().mockResolvedValue({}),
  sendSuspensionEmail: jest.fn().mockResolvedValue({}),
  sendUnsuspensionEmail: jest.fn().mockResolvedValue({}),
  sendDeletionEmail: jest.fn().mockResolvedValue({})
}));
jest.mock('../../src/config/redis', () => ({
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  keys: jest.fn()
}));
jest.mock('argon2');
jest.mock('jsonwebtoken');
jest.mock('../../src/config/logger');

describe('AuthService Unit Tests', () => {
  const mockUser = { id: 'u1', email: 'test@t.com', username: 'u', role: 'user', is_email_verified: true };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'access';
    process.env.JWT_REFRESH_SECRET = 'refresh';
  });

  describe('registerWithEmailPassword', () => {
    it('should throw error if email exists', async () => {
      UserRepository.findByEmail.mockResolvedValueOnce(mockUser);
      await expect(AuthService.registerWithEmailPassword('test@t.com', 'u', 'p', 'd1'))
        .rejects.toThrow('Email already registered');
    });

    it('should register and generate tokens', async () => {
      UserRepository.findByEmail.mockResolvedValueOnce(null);
      argon2.hash.mockResolvedValueOnce('hashed');
      UserRepository.create.mockResolvedValueOnce(mockUser);
      jwt.sign.mockReturnValue('token');

      const res = await AuthService.registerWithEmailPassword('test@t.com', 'u', 'p', 'd1');
      expect(res.accessToken).toBe('token');
      expect(UserRepository.create).toHaveBeenCalled();
    });
  });

  describe('loginWithEmailPassword', () => {
    it('should throw for invalid credentials', async () => {
      UserRepository.findByEmail.mockResolvedValueOnce(null);
      await expect(AuthService.loginWithEmailPassword('no@t.com', 'p', 'd1'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should throw if account is suspended', async () => {
      UserRepository.findByEmail.mockResolvedValueOnce({ ...mockUser, is_suspended: true, suspension_reason: 'Rules' });
      const err = await AuthService.loginWithEmailPassword('t@t.com', 'p', 'd1').catch(e => e);
      expect(err.message).toContain('Rules');
      expect(err.statusCode).toBe(403);
    });

    it('should handle account lockout', async () => {
      const future = new Date(Date.now() + 100000);
      UserRepository.findByEmail.mockResolvedValueOnce({ ...mockUser, lockout_until: future, password_hash: 'h' });
      const err = await AuthService.loginWithEmailPassword('t@t.com', 'p', 'd1').catch(e => e);
      expect(err.message).toContain('Account temporarily locked');
    });

    it('should trigger 2FA if enabled', async () => {
      UserRepository.findByEmail.mockResolvedValueOnce({ ...mockUser, two_step_enabled: true, phone_number: '+123', password_hash: 'h' });
      argon2.verify.mockResolvedValueOnce(true);
      process.env.TWILIO_ACCOUNT_SID = 'sid';

      const res = await AuthService.loginWithEmailPassword('t0@t.com', 'p', 'd1');
      expect(res.requires2FA).toBe(true);
      expect(redisClient.setex).toHaveBeenCalledWith(expect.stringContaining('2fa_code:u1'), 300, expect.any(String));
    });

    it('should handle reactivation for deactivated users', async () => {
        UserRepository.findByEmail.mockResolvedValueOnce({ ...mockUser, is_deactivated: true, password_hash: 'h' });
        argon2.verify.mockResolvedValueOnce(true);
        jwt.sign.mockReturnValue('t');

        const res = await AuthService.loginWithEmailPassword('t@t.com', 'p', 'd1');
        expect(res.accessToken).toBe('t');
        expect(VerificationService.sendVerificationEmail).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('reactivation'));
    });
  });

  describe('refreshTokens', () => {
    it('should succeed with valid refresh token', async () => {
      jwt.verify.mockReturnValueOnce({ id: 'u1' });
      const crypto = require('crypto');
      const rt = 'valid-rt';
      const hash = crypto.createHash('sha256').update(rt).digest('hex');
      redisClient.get.mockResolvedValueOnce(hash);
      UserRepository.findById.mockResolvedValueOnce(mockUser);
      jwt.sign.mockReturnValue('new-token');

      const res = await AuthService.refreshTokens(rt, 'd1');
      expect(res.accessToken).toBe('new-token');
    });

    it('should throw for tampered token hash', async () => {
        jwt.verify.mockReturnValueOnce({ id: 'u1' });
        redisClient.get.mockResolvedValueOnce('wrong-hash');
        await expect(AuthService.refreshTokens('rt', 'd1'))
          .rejects.toThrow('Invalid or expired refresh token');
    });
  });

  describe('forgotPassword & changePassword', () => {
    it('should reset password in forgotPassword', async () => {
      UserRepository.findByEmail.mockResolvedValueOnce(mockUser);
      argon2.hash.mockResolvedValueOnce('new-h');
      
      const res = await AuthService.forgotPassword('t@t.com');
      expect(res.message).toContain('sent to your email');
      expect(UserRepository.updatePassword).toHaveBeenCalled();
      expect(VerificationService.sendNewPasswordEmail).toHaveBeenCalled();
    });

    it('should allow setting password for Google users (no old pass required)', async () => {
      UserRepository.findById.mockResolvedValueOnce({ ...mockUser, password_hash: null });
      argon2.hash.mockResolvedValueOnce('new-h');
      
      const res = await AuthService.changePassword('u1', null, 'new-p');
      expect(res.message).toContain('updated successfully');
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should verify old password for Local users', async () => {
        UserRepository.findById.mockResolvedValueOnce({ ...mockUser, password_hash: 'old-h' });
        argon2.verify.mockResolvedValueOnce(false);
        await expect(AuthService.changePassword('u1', 'wrong', 'new'))
            .rejects.toThrow('Incorrect current password');
    });
  });

  describe('logoutAllDevices', () => {
    it('should delete all keys for user', async () => {
        redisClient.keys.mockResolvedValueOnce(['k1', 'k2']);
        await AuthService.logoutAllDevices('u1');
        expect(redisClient.del).toHaveBeenCalledWith(['k1', 'k2']);
    });
  });
});
