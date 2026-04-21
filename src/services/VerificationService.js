const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { logger } = require('../config/logger');

class VerificationService {
  constructor() {
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    this.twilioClient = process.env.TWILIO_ACCOUNT_SID ? twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    ) : null;
  }

  async sendVerificationEmail(toEmail, textContent) {
    if (process.env.NODE_ENV === 'test') {
      logger.info(`[TEST BYPASS] Verification email to ${toEmail}`);
      return;
    }
    try {
      await this.emailTransporter.sendMail({
        from: `"Blog Platform" <${process.env.EMAIL_FROM}>`,
        to: toEmail,
        subject: "Verify Your Account",
        text: textContent,
      });
      logger.info('Verification email sent', { toEmail });
    } catch (error) {
      logger.error(`Email verification issue: ${error.message}`, { action: 'sendVerificationEmail', toEmail, error: error.message, stack: error.stack });
      throw error;
    }
  }

  async sendSuspensionEmail(toEmail, reason) {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.emailTransporter.sendMail({
        from: `"Blog Platform Security" <${process.env.EMAIL_FROM}>`,
        to: toEmail,
        subject: "Notice: Account Suspended",
        text: `Your account has been suspended for the following reason:\n\n"${reason}"\n\nIf you believe this is an error, please contact support.`,
      });
      logger.info('Suspension email sent', { toEmail, reason });
    } catch (error) {
      logger.error('Failed to send suspension email', { error: error.message });
    }
  }

  async sendUnsuspensionEmail(toEmail) {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.emailTransporter.sendMail({
        from: `"Blog Platform Security" <${process.env.EMAIL_FROM}>`,
        to: toEmail,
        subject: "Notice: Account Restored",
        text: `Your account has been successfully restored. You may now log back in.`,
      });
      logger.info('Unsuspension email sent', { toEmail });
    } catch (error) {
      logger.error('Failed to send unsuspension email', { error: error.message });
    }
  }

  async sendDeletionEmail(toEmail, reason) {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.emailTransporter.sendMail({
        from: `"Blog Platform Security" <${process.env.EMAIL_FROM}>`,
        to: toEmail,
        subject: "Notice: Account Deleted",
        text: `Your account has been permanently deleted from our platform for the following reason:\n\n"${reason}"\n\nIf you believe this is an error, please contact support immediately.`,
      });
      logger.info('Deletion email sent', { toEmail, reason });
    } catch (error) {
      logger.error('Failed to send deletion email', { error: error.message });
    }
  }

  async sendVerificationSMS(phoneNumber, code) {
    if (process.env.NODE_ENV === 'test') {
      logger.info(`[TEST BYPASS] SMS to ${phoneNumber}: ${code}`);
      return;
    }
    if (!this.twilioClient) {
      logger.warn('Twilio not configured, skipping SMS');
      return;
    }
    try {
      await this.twilioClient.messages.create({
        body: `Your Blog Verification Code is: ${code}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });
      logger.info('Verification SMS sent', { phoneNumber });
    } catch (error) {
      logger.error(`SMS verification issue: ${error.message}`, { action: 'sendVerificationSMS', phoneNumber, error: error.message, stack: error.stack });
      throw error;
    }
  }

  async sendNewPasswordEmail(toEmail, newPassword) {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.emailTransporter.sendMail({
        from: `"Blog Platform Support" <${process.env.EMAIL_FROM}>`,
        to: toEmail,
        subject: "Your New Password",
        text: `We have generated a new password for your account as requested.\n\nNew Password: ${newPassword}\n\nPlease login using this password and we strongly recommend changing it immediately from your profile settings.`,
      });
      logger.info('New password email sent', { toEmail });
    } catch (error) {
      logger.error('Failed to send new password email', { error: error.message });
      throw error;
    }
  }
}

module.exports = new VerificationService();
