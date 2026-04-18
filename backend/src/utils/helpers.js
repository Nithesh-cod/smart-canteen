// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
// Utility functions used across the application
// ============================================================================

/**
 * Generate unique order number
 * @returns {string} Unique order number (format: OZ1234567890123)
 */
const generateOrderNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `OZ${timestamp}${random}`;
};

/**
 * Calculate loyalty points earned from order amount
 * @param {number} amount - Order amount in rupees
 * @returns {number} Points earned (10% of amount)
 */
const calculatePoints = (amount) => {
  return Math.floor(amount * 0.1); // 10% cashback as points
};

/**
 * Get student tier based on total spent
 * @param {number} totalSpent - Total amount spent by student
 * @returns {string} Tier name (Bronze, Silver, Gold, Platinum)
 */
const getTier = (totalSpent) => {
  if (totalSpent >= 5000) return 'Platinum';
  if (totalSpent >= 3000) return 'Gold';
  if (totalSpent >= 1000) return 'Silver';
  return 'Bronze';
};

/**
 * Format price for display
 * @param {number} price - Price in rupees
 * @returns {string} Formatted price (e.g., "₹120.00")
 */
const formatPrice = (price) => {
  return `₹${parseFloat(price).toFixed(2)}`;
};

/**
 * Convert rupees to paise (for Razorpay)
 * @param {number} rupees - Amount in rupees
 * @returns {number} Amount in paise
 */
const rupeesToPaise = (rupees) => {
  return Math.round(rupees * 100);
};

/**
 * Convert paise to rupees
 * @param {number} paise - Amount in paise
 * @returns {number} Amount in rupees
 */
const paiseToRupees = (paise) => {
  return paise / 100;
};

/**
 * Validate phone number (Indian format)
 * @param {string} phone - Phone number
 * @returns {boolean} True if valid
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

/**
 * Validate email address
 * @param {string} email - Email address
 * @returns {boolean} True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitize string (remove special characters)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  return str.replace(/[<>]/g, '');
};

/**
 * Get time ago string (e.g., "5 minutes ago")
 * @param {Date} date - Date to compare
 * @returns {string} Time ago string
 */
const getTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'just now';
};

/**
 * Calculate estimated preparation time
 * @param {array} items - Array of order items
 * @returns {number} Estimated time in minutes
 */
const calculateEstimatedTime = (items) => {
  if (!items || items.length === 0) return 10;
  
  // Get max preparation time from items
  const maxTime = Math.max(...items.map(item => item.preparation_time || 10));
  
  // Add 2 minutes for each additional item
  const additionalTime = (items.length - 1) * 2;
  
  return Math.min(maxTime + additionalTime, 45); // Max 45 minutes
};

/**
 * Generate random table number
 * @returns {number} Random table number (1-20)
 */
const generateTableNumber = () => {
  return Math.floor(Math.random() * 20) + 1;
};

/**
 * Check if time is within business hours
 * @param {Date} date - Date to check
 * @returns {boolean} True if within business hours
 */
const isWithinBusinessHours = (date = new Date()) => {
  const hours = date.getHours();
  // Business hours: 8 AM to 10 PM
  return hours >= 8 && hours < 22;
};

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @param {string} format - Format type ('short', 'long', 'time')
 * @returns {string} Formatted date
 */
const formatDate = (date, format = 'short') => {
  const d = new Date(date);
  
  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-IN');
    case 'long':
      return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    case 'time':
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'datetime':
      return `${d.toLocaleDateString('en-IN')} ${d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      })}`;
    default:
      return d.toLocaleDateString('en-IN');
  }
};

/**
 * Paginate array
 * @param {array} array - Array to paginate
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Items per page
 * @returns {object} Paginated result
 */
const paginate = (array, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const paginatedItems = array.slice(offset, offset + limit);
  const totalPages = Math.ceil(array.length / limit);
  
  return {
    items: paginatedItems,
    page,
    limit,
    total: array.length,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
};

/**
 * Round to 2 decimal places
 * @param {number} num - Number to round
 * @returns {number} Rounded number
 */
const roundToTwo = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Generate random string
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
const generateRandomString = (length = 10) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

/**
 * Sleep function (async delay)
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateOrderNumber,
  calculatePoints,
  getTier,
  formatPrice,
  rupeesToPaise,
  paiseToRupees,
  isValidPhone,
  isValidEmail,
  sanitizeString,
  getTimeAgo,
  calculateEstimatedTime,
  generateTableNumber,
  isWithinBusinessHours,
  formatDate,
  paginate,
  roundToTwo,
  generateRandomString,
  sleep
};