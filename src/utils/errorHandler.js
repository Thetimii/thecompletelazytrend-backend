/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async error handler middleware
 * @param {Function} fn - Async route handler
 * @returns {Function} - Express middleware
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default {
  ApiError,
  asyncHandler
};
