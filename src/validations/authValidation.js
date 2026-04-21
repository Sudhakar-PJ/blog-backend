const Joi = require('joi');

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().min(8),
    username: Joi.string().required().min(3).max(30),
    deviceId: Joi.string().optional()
  })
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required(),
    deviceId: Joi.string().optional()
  })
};

const verifyEmail = {
  body: Joi.object().keys({
    code: Joi.string().required().length(6)
  })
};

const verify2FA = {
  body: Joi.object().keys({
    tempToken: Joi.string().required(),
    code: Joi.string().required().length(6)
  })
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().required().email()
  })
};

module.exports = {
  register,
  login,
  verifyEmail,
  verify2FA,
  forgotPassword
};
