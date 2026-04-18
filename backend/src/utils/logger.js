// ============================================================================
// LOGGER UTILITY
// ============================================================================
// Simple logging utility with different levels
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Get formatted timestamp
 * @returns {string} Formatted timestamp
 */
const getTimestamp = () => {
  const now = new Date();
  return now.toISOString();
};

/**
 * Format log message
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {object} data - Additional data
 * @returns {string} Formatted log message
 */
const formatMessage = (level, message, data = null) => {
  const timestamp = getTimestamp();
  let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (data) {
    formatted += `\n${JSON.stringify(data, null, 2)}`;
  }
  
  return formatted;
};

/**
 * Log info message
 * @param {string} message - Message to log
 * @param {object} data - Additional data
 */
const info = (message, data = null) => {
  const formatted = formatMessage('info', message, data);
  console.log(`${colors.blue}${formatted}${colors.reset}`);
};

/**
 * Log success message
 * @param {string} message - Message to log
 * @param {object} data - Additional data
 */
const success = (message, data = null) => {
  const formatted = formatMessage('success', message, data);
  console.log(`${colors.green}${formatted}${colors.reset}`);
};

/**
 * Log warning message
 * @param {string} message - Message to log
 * @param {object} data - Additional data
 */
const warn = (message, data = null) => {
  const formatted = formatMessage('warn', message, data);
  console.warn(`${colors.yellow}${formatted}${colors.reset}`);
};

/**
 * Log error message
 * @param {string} message - Message to log
 * @param {object} error - Error object or data
 */
const error = (message, error = null) => {
  const formatted = formatMessage('error', message, error);
  console.error(`${colors.red}${formatted}${colors.reset}`);
  
  // Log stack trace if error object provided
  if (error && error.stack) {
    console.error(`${colors.red}Stack Trace:\n${error.stack}${colors.reset}`);
  }
};

/**
 * Log debug message (only in development)
 * @param {string} message - Message to log
 * @param {object} data - Additional data
 */
const debug = (message, data = null) => {
  if (process.env.NODE_ENV === 'development') {
    const formatted = formatMessage('debug', message, data);
    console.log(`${colors.magenta}${formatted}${colors.reset}`);
  }
};

/**
 * Log HTTP request
 * @param {object} req - Express request object
 */
const logRequest = (req) => {
  const message = `${req.method} ${req.originalUrl}`;
  const data = {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body
  };
  
  info(message, process.env.NODE_ENV === 'development' ? data : null);
};

/**
 * Log database query
 * @param {string} query - SQL query
 * @param {number} duration - Query duration in ms
 */
const logQuery = (query, duration) => {
  if (process.env.NODE_ENV === 'development') {
    const message = `Query executed in ${duration}ms`;
    debug(message, { query: query.substring(0, 100) + '...' });
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  info,
  success,
  warn,
  error,
  debug,
  logRequest,
  logQuery
};