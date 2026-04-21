const UserService = require('../../src/services/UserService');
const UserRepository = require('../../src/repositories/UserRepository');
const VerificationService = require('../../src/services/VerificationService');
const redis = require('../../src/config/redis');
const { query } = require('../../src/config/db');

jest.mock('../../src/repositories/UserRepository');
jest.mock('../../src/services/VerificationService');
jest.mock('../../src/config/redis', () => ({
  set: jest.fn(),
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn()
}));
jest.mock('../../src/config/db', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/MediaService');
jest.mock('../../src/services/AuthService', () => ({
  logoutAllDevices: jest.fn()
}));
jest.mock('../../src/services/FollowService', () => ({
  getFollowCounts: jest.fn()
}));

describe('UserService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Social & Admin Promotions', () => {
    it('should promote a user to admin successfully', async () => {
      UserRepository.findById.mockResolvedValueOnce({ username: 'target' }); // target
      UserRepository.findById.mockResolvedValueOnce({ username: 'admin_user' }); // requester
      UserRepository.updateRole.mockResolvedValueOnce({ role: 'admin' });

      const res = await UserService.promoteToAdmin('uid-1', { id: 'admin-1' });
      expect(res.role).toBe('admin');
      expect(UserRepository.updateRole).toHaveBeenCalledWith('uid-1', 'admin');
    });

    it('should block demoting a superadmin', async () => {
      UserRepository.findById.mockResolvedValueOnce({ role: 'superadmin' });
      await expect(UserService.demoteToUser('uid-1', { id: 'admin-1' }))
        .rejects.toThrow('Cannot demote a superadmin');
    });
  });

  describe('Account Status & Suspensions', () => {
    it('should suspend a user and set redis flag', async () => {
      UserRepository.findById.mockResolvedValueOnce({ email: 'target@test.com', username: 'target' }); // target
      UserRepository.findById.mockResolvedValueOnce({ username: 'admin' }); // requester
      
      await UserService.toggleSuspension('uid-1', { id: 'admin-1', role: 'superadmin' }, 'suspend', 'Reason');
      
      expect(redis.set).toHaveBeenCalledWith('suspended_user:uid-1', 'true');
      expect(VerificationService.sendSuspensionEmail).toHaveBeenCalledWith('target@test.com', 'Reason');
    });

    it('should unsuspend a user and delete redis flag', async () => {
      UserRepository.findById.mockResolvedValueOnce({ email: 'target@test.com', username: 'target' }); // target
      UserRepository.findById.mockResolvedValueOnce({ username: 'admin' }); // requester
      
      await UserService.toggleSuspension('uid-1', { id: 'admin-1', role: 'superadmin' }, 'unsuspend');
      
      expect(redis.del).toHaveBeenCalledWith('suspended_user:uid-1');
      expect(VerificationService.sendUnsuspensionEmail).toHaveBeenCalledWith('target@test.com');
    });

    it('should block self-suspension', async () => {
      UserRepository.findById.mockResolvedValueOnce({ id: 'me' });
      await expect(UserService.toggleSuspension('me', { id: 'me' }, 'suspend', 'Reason'))
        .rejects.toThrow('You cannot suspend your own account.');
    });
  });

  describe('Account Deletion RBAC', () => {
    it('should allow self-deletion', async () => {
      UserRepository.findById.mockResolvedValueOnce({ id: 'me', email: 'me@test.com' });
      await UserService.deleteAccount('me', { id: 'me' }, 'Leaving');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM users'), ['me']);
    });

    it('should block deletion of admin by a normal admin', async () => {
      UserRepository.findById.mockResolvedValueOnce({ id: 'target-admin', role: 'admin' });
      await expect(UserService.deleteAccount('target-admin', { id: 'admin-1', role: 'admin' }, 'Reason'))
        .rejects.toThrow('Permission denied to delete this account');
    });

    it('should allow deletion of user by admin', async () => {
      UserRepository.findById.mockResolvedValueOnce({ id: 'target-user', role: 'user', email: 'u@test.com' });
      UserRepository.findById.mockResolvedValueOnce({ username: 'admin' }); // for logger 
      await UserService.deleteAccount('target-user', { id: 'admin-1', role: 'admin' }, 'Reason');
      expect(query).toHaveBeenCalled();
    });
  });

  describe('Phone Verification', () => {
    it('should generate and store code in redis', async () => {
      UserRepository.findById.mockResolvedValueOnce({ phone_number: '+123', id: 'uid' });
      await UserService.requestPhoneVerification('uid');
      expect(redis.setex).toHaveBeenCalledWith(expect.stringContaining('phone_verif_pending:uid'), 300, expect.any(String));
      expect(VerificationService.sendVerificationSMS).toHaveBeenCalled();
    });

    it('should confirm verification if codes match', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify({ code: '123456', phoneNumber: '+123' }));
      await UserService.confirmPhoneVerification('uid', '123456');
      expect(UserRepository.updateUserPhoneAndVerify).toHaveBeenCalledWith('uid', '+123');
    });

    it('should throw error for invalid code', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify({ code: '111111', phoneNumber: '+123' }));
      await expect(UserService.confirmPhoneVerification('uid', '222222'))
        .rejects.toThrow('Invalid verification code');
    });
  });
});
