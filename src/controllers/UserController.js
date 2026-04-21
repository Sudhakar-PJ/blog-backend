const UserService = require("../services/UserService");
const FollowService = require("../services/FollowService");
const AuthService = require("../services/AuthService");
const ApiResponse = require("../utils/apiResponse");
const { CATEGORY_GROUPS } = require("../services/AIService");

class UserController {
  async promoteToAdmin(req, res, next) {
    try {
      const { userId, targetUserId, role = "admin" } = req.body;
      const idToPromote = userId || targetUserId;
      if (!idToPromote) return ApiResponse.error(res, "User ID is required", 400);

      const updated = await UserService.promoteToAdmin(idToPromote, req.user, role);
      return ApiResponse.success(res, { message: `User promoted to ${role}`, user: updated });
    } catch (error) {
      next(error);
    }
  }

  async demoteToUser(req, res, next) {
    try {
      const { userId, targetUserId } = req.body;
      const idToDemote = userId || targetUserId;
      if (!idToDemote) return ApiResponse.error(res, "User ID is required", 400);

      const updated = await UserService.demoteToUser(idToDemote, req.user);
      return ApiResponse.success(res, { message: "User demoted", user: updated });
    } catch (error) {
      next(error);
    }
  }

  async toggleFollow(req, res, next) {
    try {
      const targetId = req.params.targetId;
      const result = await FollowService.toggleFollow(req.user.id, targetId);
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getFollowers(req, res, next) {
    try {
      const { targetId } = req.params;
      const followers = await FollowService.getFollowers(targetId);
      return ApiResponse.success(res, { followers });
    } catch (error) {
      next(error);
    }
  }

  async getFollowing(req, res, next) {
    try {
      const { targetId } = req.params;
      const following = await FollowService.getFollowing(targetId);
      return ApiResponse.success(res, { following });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      // Allow fetching any profile by ID if targetId is provided, else get own profile
      const targetId = req.params.targetId || req.user.id;
      const profile = await UserService.getProfile(targetId, req.user.id);
      return ApiResponse.success(res, profile);
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const { fullName, bio, profilePicUrl, preferences } = req.body;
      const updated = await UserService.updateProfile(req.user.id, {
        fullName,
        bio,
        profilePicUrl,
        preferences,
      });
      return ApiResponse.success(res, { message: "Profile updated successfully", profile: updated });
    } catch (error) {
      next(error);
    }
  }

  async uploadAvatar(req, res, next) {
    try {
      if (!req.file)
        return ApiResponse.error(res, "No image file provided", 400);
      const updated = await UserService.uploadAvatar(req.user.id, req.file);
      return ApiResponse.success(res, {
        message: "Avatar uploaded successfully",
        profilePicUrl: updated.profile_pic_url,
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(req, res, next) {
    try {
      const { preferences } = req.body; // array of strings
      const updated = await UserService.updatePreferences(
        req.user.id,
        preferences,
      );
      return ApiResponse.success(res, {
        message: "Preferences updated",
        preferences: updated.preferences,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteAccount(req, res, next) {
    try {
      const { targetUserId } = req.params;
      const { reason } = req.body || {};
      await UserService.deleteAccount(targetUserId, req.user, reason);
      return ApiResponse.success(res, { message: "User deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async deactivateSelf(req, res, next) {
    try {
      await UserService.deactivateAccount(req.user.id);
      return ApiResponse.success(res, { message: "Account deactivated" });
    } catch (error) {
      next(error);
    }
  }

  async toggleSuspension(req, res, next) {
    try {
      const { targetUserId } = req.params;
      const { action, reason } = req.body;
      if (action === "suspend" && !reason) {
        return ApiResponse.error(res, "Suspension reason is required", 400);
      }
      await UserService.toggleSuspension(
        targetUserId,
        req.user,
        action,
        reason,
      );
      return ApiResponse.success(res, { message: `User account has been ${action}ed.` });
    } catch (error) {
      next(error);
    }
  }

  async toggle2FA(req, res, next) {
    try {
      const { enabled, phoneNumber } = req.body;
      const updated = await UserService.toggle2FA(
        req.user.id,
        enabled,
        phoneNumber,
      );
      return ApiResponse.success(res, { message: "2FA settings updated", user: updated });
    } catch (error) {
      next(error);
    }
  }

  async verifyPhoneRequest(req, res, next) {
    try {
      const { phoneNumber } = req.body;
      await UserService.requestPhoneVerification(req.user.id, phoneNumber);
      return ApiResponse.success(res, { message: "Verification SMS sent" });
    } catch (error) {
      next(error);
    }
  }

  async verifyPhoneConfirm(req, res, next) {
    try {
      const { code } = req.body;
      if (!code) return ApiResponse.error(res, "Code is required", 400);
      await UserService.confirmPhoneVerification(req.user.id, code);
      return ApiResponse.success(res, { message: "Phone verified successfully" });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return ApiResponse.error(res, "Old and new passwords are required", 400);
      }
      const result = await AuthService.changePassword(
        req.user.id,
        oldPassword,
        newPassword,
      );
      return ApiResponse.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async searchBloggers(req, res, next) {
    try {
      const { q = "", limit = 10, page = 1 } = req.query;
      const bloggers = await UserService.searchBloggers(
        req.user.id,
        q,
        parseInt(limit),
        parseInt(page),
      );
      return ApiResponse.success(res, { bloggers });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req, res, next) {
    try {
      return ApiResponse.success(res, { categories: CATEGORY_GROUPS });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
