// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================
// Global error handler for Express application
// ============================================================================

/**
 * Not Found (404) Handler
 * Catches all requests to undefined routes
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

/**
 * Global Error Handler
 * Catches all errors thrown in the application
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Determine error message
  const message = err.message || 'Internal Server Error';

  // Prepare error response
  const errorResponse = {
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    errorResponse.statusCode = 400;
    errorResponse.message = 'Validation Error';
    errorResponse.errors = err.errors;
  }

  if (err.name === 'UnauthorizedError') {
    errorResponse.statusCode = 401;
    errorResponse.message = 'Unauthorized - Invalid token';
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    errorResponse.statusCode = 409;
    errorResponse.message = 'Duplicate entry - Record already exists';
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    errorResponse.statusCode = 400;
    errorResponse.message = 'Invalid reference - Related record not found';
  }

  // Send error response
  res.status(errorResponse.statusCode).json(errorResponse);
};

/**
 * Async Error Handler Wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  notFound,
  errorHandler,
  asyncHandler
};