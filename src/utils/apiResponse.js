/**
 * Standardized API Response utility
 */
class ApiResponse {
  /**
   * Send a success response
   * @param {import('express').Response} res 
   * @param {any} data 
   * @param {number} statusCode 
   */
  static success(res, data = {}, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data: data,
      error: null
    });
  }

  /**
   * Send an error response
   * @param {import('express').Response} res 
   * @param {string} message 
   * @param {number} statusCode 
   */
  static error(res, message = 'An error occurred', statusCode = 500) {
    return res.status(statusCode).json({
      success: false,
      data: null,
      error: message
    });
  }
}

module.exports = ApiResponse;
