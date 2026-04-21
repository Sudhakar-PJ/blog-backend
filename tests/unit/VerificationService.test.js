const VerificationService = require('../../src/services/VerificationService');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { logger } = require('../../src/config/logger');

jest.mock('nodemailer');
jest.mock('twilio');

describe('VerificationService Unit Tests', () => {
  let mockTransporter;
  let mockTwilio;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup nodemailer mock
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: '123' })
    };
    nodemailer.createTransport.mockReturnValue(mockTransporter);

    // Setup twilio mock
    mockTwilio = {
      messages: {
        create: jest.fn().mockResolvedValue({ sid: 'SM123' })
      }
    };
    twilio.mockReturnValue(mockTwilio);

    // Manually inject instances because they were created on first require
    VerificationService.emailTransporter = mockTransporter;
    VerificationService.twilioClient = mockTwilio;
  });

  describe('Email Notifications', () => {
    it('should skip email and log in test mode', async () => {
      const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      await VerificationService.sendVerificationEmail('test@test.com', 'Code: 123');
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[TEST BYPASS]'));
      spy.mockRestore();
    });

    it('should send actual emails when NOT in test mode (simulated)', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      await VerificationService.sendVerificationEmail('test@test.com', 'Hello');
      expect(mockTransporter.sendMail).toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle sendMail errors', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP Error'));
      
      await expect(VerificationService.sendVerificationEmail('test@test.com', 'Hello'))
        .rejects.toThrow('SMTP Error');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should send suspension, unsuspension, and deletion emails', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      await VerificationService.sendSuspensionEmail('test@test.com', 'Botting');
      await VerificationService.sendUnsuspensionEmail('test@test.com');
      await VerificationService.sendDeletionEmail('test@test.com', 'Policy violation');
      
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should send new password emails', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      await VerificationService.sendNewPasswordEmail('test@test.com', 'Secret123');
      expect(mockTransporter.sendMail).toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('SMS Notifications', () => {
    beforeEach(() => {
        // Ensure twilio client exists for these tests
        VerificationService.twilioClient = mockTwilio;
    });

    it('should skip SMS in test mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      
      await VerificationService.sendVerificationSMS('+123456789', '1234');
      expect(mockTwilio.messages.create).not.toHaveBeenCalled();
      
      spy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should send SMS in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      await VerificationService.sendVerificationSMS('+123456789', '1234');
      expect(mockTwilio.messages.create).toHaveBeenCalled();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should warn if twilio is not configured', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const originalClient = VerificationService.twilioClient;
      VerificationService.twilioClient = null;
      
      const spy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      await VerificationService.sendVerificationSMS('+123456789', '1234');
      
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Twilio not configured'));
      
      spy.mockRestore();
      VerificationService.twilioClient = originalClient;
      process.env.NODE_ENV = originalEnv;
    });
  });
});
