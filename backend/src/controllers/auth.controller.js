// ============================================================================
// AUTH CONTROLLER
// ============================================================================
// Handles student authentication: signup, login, profile, logout, token refresh
// ============================================================================

const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/error.middleware');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build the JWT payload from a student row.
 * Role is derived from ADMIN_ROLLS / CHEF_ROLLS env vars so the frontend
 * can check access without making an extra API call.
 * @param {Object} student
 * @returns {{ id, roll_number, name, tier, role }}
 */
const buildPayload = (student) => {
  const adminRolls = (process.env.ADMIN_ROLLS || '').split(',').map(r => r.trim()).filter(Boolean);
  const chefRolls  = (process.env.CHEF_ROLLS  || '').split(',').map(r => r.trim()).filter(Boolean);
  let role = 'student';
  if (adminRolls.includes(student.roll_number))      role = 'admin';
  else if (chefRolls.includes(student.roll_number))  role = 'chef';
  return {
    id: student.id,
    roll_number: student.roll_number,
    name: student.name,
    tier: student.tier,
    role,
  };
};

/**
 * Issue a short-lived access token (15 min).
 * @param {Object} student
 * @returns {string}
 */
const generateAccessToken = (student) =>
  jwt.sign(buildPayload(student), process.env.JWT_SECRET, { expiresIn: '15m' });

/**
 * Issue a long-lived refresh token (7 days).
 * @param {Object} student
 * @returns {string}
 */
const generateRefreshToken = (student) =>
  jwt.sign(buildPayload(student), process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

/**
 * Safe student shape to return in responses (no sensitive internals).
 * @param {Object} student - Raw DB row
 * @returns {Object}
 */
const safeStudent = (student) => ({
  id: student.id,
  name: student.name,
  roll_number: student.roll_number,
  phone: student.phone,
  email: student.email,
  department: student.department,
  profile_image_url: student.profile_image_url || null,
  points: student.points,
  tier: student.tier,
  total_orders: student.total_orders || 0,
  total_spent: student.total_spent || 0,
  created_at: student.created_at,
  last_login: student.last_login
});

// ============================================================================
// SIGNUP
// ============================================================================

/**
 * POST /api/auth/signup
 * Create a new student account.
 * No password is stored — students authenticate via roll number or phone only.
 * Body: { name, roll_number, phone, email?, department? }
 */
const signup = asyncHandler(async (req, res) => {
  const { name, roll_number, phone, email, department } = req.body;

  // Required field validation
  if (!name || !roll_number || !phone) {
    return res.status(400).json({
      success: false,
      message: 'name, roll_number, and phone are required'
    });
  }

  // Duplicate roll number check
  const existingRoll = await Student.findByRoll(roll_number.trim());
  if (existingRoll) {
    return res.status(400).json({
      success: false,
      message: 'A student account with this roll number already exists'
    });
  }

  // Duplicate phone check
  const existingPhone = await Student.findByPhone(phone.trim());
  if (existingPhone) {
    return res.status(400).json({
      success: false,
      message: 'A student account with this phone number already exists'
    });
  }

  // Persist new student (points = 0, tier = 'Bronze' set by model)
  const student = await Student.create({
    name: name.trim(),
    roll_number: roll_number.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : null,
    department: department ? department.trim() : null
  });

  const token = generateAccessToken(student);
  const refresh_token = generateRefreshToken(student);

  logger.success('Student registered', { id: student.id, roll_number: student.roll_number });

  return res.status(201).json({
    success: true,
    data: {
      student: safeStudent(student),
      token,
      refresh_token
    }
  });
});

// ============================================================================
// LOGIN
// ============================================================================

/**
 * POST /api/auth/login
 * Authenticate with roll number OR phone number (no password needed).
 * Body: { identifier }  — identifier is roll_number or phone
 */
const login = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({
      success: false,
      message: 'identifier (roll number or phone) is required'
    });
  }

  const student = await Student.findByIdentifier(identifier.trim());
  if (!student) {
    // 404 — not 401 — so the axios interceptor does NOT fire auth:unauthorized.
    // The student kiosk uses this to detect "new user" and falls through to signup.
    return res.status(404).json({
      success: false,
      message: 'No account found with that roll number or phone number'
    });
  }

  if (!student.is_active) {
    return res.status(403).json({
      success: false,
      message: 'Your account has been deactivated. Please contact support.'
    });
  }

  // Record the login timestamp
  await Student.updateLastLogin(student.id);

  const token = generateAccessToken(student);
  const refresh_token = generateRefreshToken(student);

  logger.info('Student logged in', { id: student.id, roll_number: student.roll_number });

  return res.status(200).json({
    success: true,
    data: {
      student: safeStudent(student),
      token,
      refresh_token
    }
  });
});

// ============================================================================
// GET PROFILE
// ============================================================================

/**
 * GET /api/auth/profile
 * Return the authenticated student's profile.
 * Requires verifyToken middleware — req.user is populated.
 */
const getProfile = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.user.id);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student profile not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      student: safeStudent(student)
    }
  });
});

// ============================================================================
// LOGOUT
// ============================================================================

/**
 * POST /api/auth/logout
 * JWT is stateless — instruct the client to discard tokens.
 * Server-side confirmation only; no token blacklisting.
 */
const logout = asyncHandler(async (req, res) => {
  logger.info('Student logged out', { id: req.user?.id });

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please discard your tokens on the client.'
  });
});

// ============================================================================
// REFRESH TOKEN
// ============================================================================

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token.
 * Body: { refresh_token }
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({
      success: false,
      message: 'refresh_token is required'
    });
  }

  // Verify with the dedicated refresh secret
  let decoded;
  try {
    decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }

  // Confirm the student still exists and is active
  const student = await Student.findById(decoded.id);
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  if (!student.is_active) {
    return res.status(403).json({
      success: false,
      message: 'Account is deactivated'
    });
  }

  const newToken = generateAccessToken(student);

  logger.info('Access token refreshed', { id: student.id });

  return res.status(200).json({
    success: true,
    data: {
      token: newToken
    }
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { signup, login, getProfile, logout, refreshToken };
