const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const UserRepository = require("../repositories/UserRepository");
const redisClient = require("../config/redis");
const { logger } = require("../config/logger");
const crypto = require("crypto");
const VerificationService = require("./VerificationService");
const ApiError = require("../utils/ApiError");

class AuthService {
  async registerWithEmailPassword(email, username, password, deviceId) {
    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      throw new ApiError(409, "Email already registered");
    }
    const hash = await argon2.hash(password);
    const user = await UserRepository.create({
      email,
      username,
      fullName: username, // Use username as initial full name
      passwordHash: hash,
      isEmailVerified: false,
    });
    // Explicitly add flag to this instance since sanitizeUser expects it
    user.hasPassword = true; 
    logger.warn(`'${username}' registered as a new user`, {
      persist: true,
      action: "register",
      userId: user.id,
      email,
      username,
    });

    // Async send verification email
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    redisClient.setex(`email_verif_code:${user.id}`, 3600, code);
    VerificationService.sendVerificationEmail(
      email,
      `Your verification code is: ${code}`,
    ).catch(() => {});

    return this.generateTokens(user, deviceId);
  }

  async loginWithEmailPassword(email, password, deviceId) {
    const user = await UserRepository.findByEmail(email);
    if (!user) throw new ApiError(401, "Invalid credentials");

    if (user.is_suspended) {
      throw new ApiError(403, `Your account has been suspended: ${user.suspension_reason || "Policy Violation"}`);
    }

    if (!user.password_hash) {
      throw new ApiError(401, "Social account detected. Please login with Google or use 'Forgot Password' to create a local password.");
    }

    console.log('LOCKOUT VAL:', user.lockout_until, new Date());
    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.lockout_until) - new Date()) / 60000);
      throw new ApiError(403, `Account temporarily locked. Please try again in ${remainingTime} minutes.`);
    }

    const isMatch = await argon2.verify(user.password_hash, password);
    
    if (!isMatch) {
      await UserRepository.incrementFailedAttempts(user.id);
      throw new ApiError(401, "Invalid credentials");
    }

    // Reset attempts on successful login
    await UserRepository.resetFailedAttempts(user.id);

    if (user.two_step_enabled && user.phone_number) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      redisClient.setex(`2fa_code:${user.id}`, 300, code); // 5 mins

      // Safety failover for local testing without Twilio
      if (!process.env.TWILIO_ACCOUNT_SID) {
        // Debug 2FA code visible only in logs DB
      } else {
        VerificationService.sendVerificationSMS(user.phone_number, code).catch(
          () => {},
        );
      }

      return {
        requires2FA: true,
        userId: user.id,
        message: "SMS verification code sent",
      };
    }

    if (user.is_deactivated) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      redisClient.setex(`email_verif_code:${user.id}`, 3600, code);
      VerificationService.sendVerificationEmail(
        user.email,
        `Your account reactivation code is: ${code}`,
      ).catch(() => {});
      user.is_email_verified = false;
    } else if (!user.is_email_verified) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      redisClient.setex(`email_verif_code:${user.id}`, 3600, code);
      VerificationService.sendVerificationEmail(
        user.email,
        `Your verification code is: ${code}`,
      ).catch(() => {});
    }

    logger.info("User logged in", { userId: user.id });
    return this.generateTokens(user, deviceId);
  }

  async loginWith2FA(userId, code, deviceId) {
    const storedCode = await redisClient.get(`2fa_code:${userId}`);
    if (!storedCode || storedCode !== code) {
      throw new ApiError(401, "Invalid or expired 2FA code");
    }

    const user = await UserRepository.findById(userId);
    if (!user) throw new ApiError(404, "User not found");

    if (user.is_suspended) {
      throw new ApiError(403, `Your account has been suspended: ${user.suspension_reason || "Policy Violation"}`);
    }

    await redisClient.del(`2fa_code:${userId}`);
    logger.info("User logged in via 2FA", { userId });
    return this.generateTokens(user, deviceId);
  }

  async verifyEmailCode(userId, code) {
    const storedCode = await redisClient.get(`email_verif_code:${userId}`);
    if (storedCode && storedCode === code) {
      await UserRepository.updateVerification(userId, "is_email_verified");
      await redisClient.del(`email_verif_code:${userId}`);
      return true;
    }
    return false;
  }

  async googleAuthCallback(profile, deviceId) {
    let user = await UserRepository.findByGoogleId(profile.id);
    if (!user) {
      user = await UserRepository.findByEmail(profile.emails[0].value);
      if (user) {
        // Link google ID to existing account
        await UserRepository.updateGoogleId(user.id, profile.id);
        user.google_id = profile.id;
      } else {
        const displayName = profile.displayName || profile.emails[0].value.split("@")[0];
        let finalizedUsername = displayName;

        // Collision check for username
        let counter = 1;
        while (await UserRepository.findByUsername(finalizedUsername)) {
          finalizedUsername = `${displayName} ${Math.floor(Math.random() * 1000)}`;
          // Safety break
          if (counter++ > 10) break;
        }

        user = await UserRepository.create({
          email: profile.emails[0].value,
          username: finalizedUsername,
          fullName: displayName,
          googleId: profile.id,
          isEmailVerified: true,
        });
        logger.warn(`'${user.username}' registered as a new user via Google`, {
          persist: true,
          action: "register",
          userId: user.id,
          email: user.email,
        });
      }
    }

    if (user.is_suspended) {
      throw new ApiError(403, `Your account has been suspended: ${user.suspension_reason || "Policy Violation"}`);
    }

    if (user.is_deactivated) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      redisClient.setex(`email_verif_code:${user.id}`, 3600, code);
      VerificationService.sendVerificationEmail(
        user.email,
        `Your account reactivation code is: ${code}`,
      ).catch(() => {});
      user.is_email_verified = false;
    }

    await UserRepository.resetFailedAttempts(user.id);
    return this.generateTokens(user, deviceId);
  }

  async refreshTokens(refreshToken, deviceId) {
    if (!refreshToken) throw new ApiError(400, "Refresh token missing");
    if (!deviceId) throw new ApiError(400, "Device ID missing");

    // Verify signature
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw new ApiError(401, "Invalid or expired refresh token");
    }

    const { id } = decoded;

    // Check with Redis using deviceId
    const hashedIncoming = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedHash = await redisClient.get(
      `refresh_token:${id}:${deviceId}`,
    );
    if (!storedHash || storedHash !== hashedIncoming) {
      throw new ApiError(401, "Invalid or expired refresh token");
    }

    // Lookup user
    const user = await UserRepository.findById(id);
    if (!user) throw new ApiError(404, "User no longer exists");

    if (user.is_suspended) {
      throw new ApiError(403, `Your account has been suspended: ${user.suspension_reason || "Policy Violation"}`);
    }

    return this.generateTokens(user, deviceId);
  }

  generateTokens(user, deviceId) {
    const payload = { id: user.id, role: user.role };

    // Abstract functional utility for token gen
    const signToken = (secret, expiresIn) =>
      jwt.sign(payload, secret, { expiresIn });

    const accessToken = signToken(process.env.JWT_ACCESS_SECRET, "15m");
    const refreshToken = signToken(process.env.JWT_REFRESH_SECRET, "7d");

    // Store hash of refresh token in redis tied to deviceId
    const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    redisClient.setex(
      `refresh_token:${user.id}:${deviceId}`,
      7 * 24 * 60 * 60,
      hashedToken,
    );

    return { user: this.sanitizeUser(user), accessToken, refreshToken };
  }

  async logout(userId, deviceId) {
    if (!userId || !deviceId) return;
    await redisClient.del(`refresh_token:${userId}:${deviceId}`);
  }

  async logoutAllDevices(userId) {
    // Attempt scan/keys to delete all refresh tokens for this user
    try {
      const keys = await redisClient.keys(`refresh_token:${userId}:*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (err) {
      // Silent error handler
    }
  }

  async forgotPassword(email) {
    const user = await UserRepository.findByEmail(email);
    if (!user) throw new ApiError(404, "User not found");

    // Generate random 10 character password
    const crypto = require("crypto");
    const newPassword = crypto.randomBytes(5).toString("hex"); // 10 chars
    const hash = await argon2.hash(newPassword);
    await UserRepository.updatePassword(user.id, hash);

    // Async send email
    VerificationService.sendNewPasswordEmail(email, newPassword).catch(
      () => {},
    );

    logger.warn(`Password reset triggered for '${user.username}'`, {
      persist: true,
      action: "forgotPassword",
      userId: user.id,
    });
    return { message: "New password sent to your email" };
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new Error("User not found");

    // Only check old password if one exists (e.g. for users who registered via Email/Password)
    // If they registered via Google, password_hash might be null, so we allow them to set one.
    if (user.password_hash) {
      const isMatch = await argon2.verify(user.password_hash, oldPassword);
      if (!isMatch) throw new ApiError(401, "Incorrect current password");
    }

    const hash = await argon2.hash(newPassword);
    await UserRepository.updatePassword(userId, hash);

    logger.info("User changed password", { userId });
    return { message: "Password updated successfully" };
  }

  sanitizeUser(user) {
    // pure function
    const { password_hash, ...safeUser } = user;
    safeUser.hasPassword = !!password_hash;
    return safeUser;
  }
}

module.exports = new AuthService();
