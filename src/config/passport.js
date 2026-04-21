const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const AuthService = require('../services/AuthService');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_client_id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/google/callback',
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const crypto = require('crypto');
      let deviceId = req.cookies?.deviceId || req.body?.deviceId;
      if (!deviceId) deviceId = crypto.randomUUID();

      // Defer to AuthService to either link or create user, and generate app tokens
      const result = await AuthService.googleAuthCallback(profile, deviceId);
      result.deviceId = deviceId; // Pass deviceId down so controller can set the cookie
      return done(null, result); // result contains { user, accessToken, refreshToken, deviceId }
    } catch (error) {
      return done(error, null);
    }
  }
));

module.exports = passport;
