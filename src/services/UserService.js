const UserRepository = require("../repositories/UserRepository");
const { query } = require("../config/db");
const MediaService = require("./MediaService");
const ApiError = require("../utils/ApiError");

class UserService {
  async promoteToAdmin(targetUserId, requester, targetRole = "admin") {
    const targetUser = await UserRepository.findById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "User not found");
    }

    // Role validation: only superadmins can promote someone to superadmin
    if (targetRole === "superadmin" && requester.role !== "superadmin") {
      throw new ApiError(403, "Only superadmins can assign the superadmin role");
    }

    const result = await UserRepository.updateRole(targetUserId, targetRole);

    // Log the promotion
    const { logger } = require("../config/logger");
    const AdminUser = await UserRepository.findById(requester.id);
    logger.critical(
      `'${targetUser.username}' got promoted to ${targetRole} by ${requester.role} '${AdminUser ? AdminUser.username : requester.id}'`,
      { action: "promoteToAdmin", targetUserId, requesterId: requester.id, targetRole },
    );

    return result;
  }

  async demoteToUser(targetUserId, requester) {
    const targetUser = await UserRepository.findById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "User not found");
    }

    if (targetUser.role === "superadmin") {
      throw new ApiError(403, "Cannot demote a superadmin");
    }

    const result = await UserRepository.updateRole(targetUserId, "user");

    // Log the demotion
    const { logger } = require("../config/logger");
    const AdminUser = await UserRepository.findById(requester.id);
    logger.critical(
      `'${targetUser.username}' got demoted to user by superadmin '${AdminUser ? AdminUser.username : requester.id}'`,
      { action: "demoteToUser", targetUserId, requesterId: requester.id },
    );

    return result;
  }

  async updatePreferences(userId, preferences) {
    return await UserRepository.updatePreferences(userId, preferences);
  }
  async getProfile(userId, currentUserId = null) {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    // Omit sensitive data
    const { password_hash, ...profile } = user;

    // Fetch follow stats
    const FollowService = require("./FollowService");
    const followStats = await FollowService.getFollowCounts(
      userId,
      currentUserId,
    );

    return { ...profile, ...followStats };
  }

  async updateProfile(userId, profileData) {
    return await UserRepository.updateProfile(userId, profileData);
  }

  async uploadAvatar(userId, file) {
    const imageUrl = await MediaService.uploadMedia(file.path, "image");
    const res = await query(
      `UPDATE users SET profile_pic_url = $1 WHERE id = $2 RETURNING *`,
      [imageUrl, userId],
    );
    return res.rows[0];
  }

  async toggle2FA(userId, enabled, phoneNumber) {
    const res = await query(
      `UPDATE users SET two_step_enabled = $1, phone_number = $2 WHERE id = $3 RETURNING *`,
      [enabled, phoneNumber || null, userId],
    );
    return res.rows[0];
  }

  async deleteAccount(targetUserId, requester, reason) {
    const targetUser = await UserRepository.findById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "User not found");
    }

    // RBAC for deletion
    let canDelete = false;
    if (requester.id == targetUserId) {
      canDelete = true; // user can delete themselves
      if (!reason) reason = "User requested account deletion";
    } else if (requester.role === "superadmin") {
      canDelete = true; // superadmin can delete anyone
    } else if (requester.role === "admin" && targetUser.role === "user") {
      canDelete = true; // admin can delete users, but not other admins or superadmins
    }

    if (!canDelete) {
      throw new ApiError(403, "Permission denied to delete this account");
    }

    if (requester.id != targetUserId && !reason) {
      throw new ApiError(400, "A deletion reason is required when deleting other users");
    }

    await query(`DELETE FROM users WHERE id = $1`, [targetUserId]);

    const { logger } = require("../config/logger");
    if (requester.id != targetUserId) {
      const AdminUser = await UserRepository.findById(requester.id);
      logger.critical(
        `'${targetUser.username}' got deleted by ${requester.role} '${AdminUser ? AdminUser.username : requester.id}'`,
        {
          action: "deleteAccount",
          targetUserId,
          requesterId: requester.id,
          reason,
        },
      );
    } else {
      logger.warn(`'${targetUser.username}' deleted their own account`, {
        action: "deleteAccount",
        persist: true,
        targetUserId,
        reason,
      });
    }

    // Send deletion email
    const VerificationService = require("./VerificationService");
    await VerificationService.sendDeletionEmail(targetUser.email, reason);
  }

  async deactivateAccount(userId) {
    await UserRepository.setDeactivated(userId);
    const { logger } = require("../config/logger");
    const user = await UserRepository.findById(userId);
    logger.warn(
      `User '${user ? user.username : userId}' deactivated their account`,
      { action: "deactivateAccount", persist: true, userId },
    );
    // Sever active connections explicitly utilizing auth architecture
    const AuthService = require("./AuthService");
    await AuthService.logoutAllDevices(userId);
  }

  async toggleSuspension(targetUserId, requester, action, reason) {
    const targetUser = await UserRepository.findById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "User not found");
    }

    if (requester.id == targetUserId) {
      throw new ApiError(403, "You cannot suspend your own account.");
    }

    // RBAC
    let canSuspend = false;
    if (requester.role === "superadmin") {
      canSuspend = true;
    } else if (requester.role === "admin" && targetUser.role === "user") {
      canSuspend = true;
    }

    if (!canSuspend) {
      throw new ApiError(403, "Permission denied to suspend this account");
    }

    const VerificationService = require("./VerificationService");
    const redis = require("../config/redis");
    const { logger } = require("../config/logger");

    if (action === "suspend") {
      await UserRepository.updateSuspension(targetUserId, true, reason);
      // Immediately invalidate any active sessions by placing their token identifier/userId in a Redis blocklist or removing cached sessions
      // Wait, a fast approach is just caching their suspended status in redis
      await redis.set(`suspended_user:${targetUserId}`, "true");

      const AdminUser = await UserRepository.findById(requester.id);
      logger.critical(
        `'${targetUser.username}' got suspended by ${requester.role} '${AdminUser ? AdminUser.username : requester.id}'`,
        { action: "suspend", targetUserId, requesterId: requester.id, reason },
      );

      // Send Email
      await VerificationService.sendSuspensionEmail(targetUser.email, reason);
    } else if (action === "unsuspend") {
      await UserRepository.updateSuspension(targetUserId, false, null);
      await redis.del(`suspended_user:${targetUserId}`);

      const AdminUser = await UserRepository.findById(requester.id);
      logger.critical(
        `'${targetUser.username}' got unsuspended by ${requester.role} '${AdminUser ? AdminUser.username : requester.id}'`,
        { action: "unsuspend", targetUserId, requesterId: requester.id },
      );

      await VerificationService.sendUnsuspensionEmail(targetUser.email);
    }
  }

  async getAllUsers(page, limit, q, role, isSuspended) {
    return await UserRepository.getAllUsers(page, limit, q, role, isSuspended);
  }

  async searchBloggers(currentUserId, q, limit, page) {
    return await UserRepository.searchBloggers(currentUserId, q, limit, page);
  }

  async requestPhoneVerification(userId, phoneNumber) {
    if (!phoneNumber) {
      const user = await UserRepository.findById(userId);
      phoneNumber = user ? user.phone_number : null;
    }

    if (!phoneNumber) {
      throw new ApiError(400, "No valid phone number provided or bound to account");
    }

    const redis = require("../config/redis");
    const VerificationService = require("./VerificationService");

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // store for 5 mins: { code, phoneNumber }
    await redis.setex(`phone_verif_pending:${userId}`, 300, JSON.stringify({ code, phoneNumber }));

    // Explicitly NO DEV FALLBACK, demand Twilio usage natively
    await VerificationService.sendVerificationSMS(phoneNumber, code);
  }

  async confirmPhoneVerification(userId, code) {
    const redis = require("../config/redis");
    const storedData = await redis.get(`phone_verif_pending:${userId}`);
    if (!storedData) {
      throw new ApiError(400, "Invalid or expired verification session");
    }

    const { code: cachedCode, phoneNumber } = JSON.parse(storedData);

    if (cachedCode !== code) {
      throw new ApiError(400, "Invalid verification code");
    }

    await UserRepository.updateUserPhoneAndVerify(userId, phoneNumber);
    await redis.del(`phone_verif_pending:${userId}`);
  }
}

module.exports = new UserService();
