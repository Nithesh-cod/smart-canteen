// ============================================================================
// AUTH CONTROLLER
// ============================================================================
// Student authentication: signup, login, profile, me, logout, token refresh.
//
// FIX S1/S2 — Real authentication:
//   • Passwords are bcrypt-hashed (cost 12) and stored in students.password_hash.
//   • Login requires identifier + password.
//   • Role comes from the students.role DB column — NOT from env-var roll lists.
//   • Admin/chef accounts are created offline via scripts/create-admin.js.
// ============================================================================

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Student = require('../models/Student');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/error.middleware');
const { createFirebaseToken } = require('../config/firebase');

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 6;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build the JWT payload from a student row.
 * Role is read straight from the DB column — the single source of truth.
 */
const buildPayload = (student) => ({
  id:          student.id,
  roll_number: student.roll_number,
  name:        student.name,
  tier:        student.tier,
  role:        student.role || 'student',
});

/** Issue an access token (default 24h). */
const generateAccessToken = (student) =>
  jwt.sign(buildPayload(student), process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });

/** Issue a refresh token (7 days). */
const generateRefreshToken = (student) =>
  jwt.sign(buildPayload(student), process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

/** Safe student shape for responses — never includes password_hash. */
const safeStudent = (student) => ({
  id:                student.id,
  name:              student.name,
  roll_number:       student.roll_number,
  phone:             student.phone,
  email:             student.email,
  department:        student.department,
  role:              student.role || 'student',
  profile_image_url: student.profile_image_url || null,
  points:            student.points,
  tier:              student.tier,
  total_orders:      student.total_orders || 0,
  total_spent:       student.total_spent || 0,
  created_at:        student.created_at,
  last_login:        student.last_login,
});

// ============================================================================
// SIGNUP
// ============================================================================
/**
 * POST /api/auth/signup
 * Create a new STUDENT account (role is always 'student' here — admin/chef
 * accounts are created offline via scripts/create-admin.js).
 * Body: { name, roll_number, phone, password, email?, department? }
 */
const signup = asyncHandler(async (req, res) => {
  const { name, roll_number, phone, password, email, department } = req.body;

  if (!name || !roll_number || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'name, roll_number, phone, and password are required',
    });
  }

  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }

  const existingRoll = await Student.findByRoll(roll_number.trim());
  if (existingRoll) {
    return res.status(409).json({
      success: false,
      message: 'A student account with this roll number already exists',
    });
  }

  const existingPhone = await Student.findByPhone(phone.trim());
  if (existingPhone) {
    return res.status(409).json({
      success: false,
      message: 'A student account with this phone number already exists',
    });
  }

  const password_hash = await bcrypt.hash(String(password), BCRYPT_COST);

  const student = await Student.create({
    name:          name.trim(),
    roll_number:   roll_number.trim(),
    phone:         phone.trim(),
    email:         email ? email.trim() : null,
    department:    department ? department.trim() : null,
    password_hash,
    role:          'student',
  });

  const token         = generateAccessToken(student);
  const refresh_token = generateRefreshToken(student);

  logger.success('Student registered', { id: student.id, roll_number: student.roll_number });

  return res.status(201).json({
    success: true,
    data: { student: safeStudent(student), token, refresh_token },
  });
});

// ============================================================================
// LOGIN
// ============================================================================
/**
 * POST /api/auth/login
 * Authenticate with roll number OR phone, plus a password.
 * Body: { identifier, password }
 */
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'identifier (roll number or phone) and password are required',
    });
  }

  const student = await Student.findByIdentifier(identifier.trim());

  // Uniform 401 for "no account" and "wrong password" — do not leak which.
  if (!student || !student.password_hash) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  const passwordOk = await bcrypt.compare(String(password), student.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (!student.is_active) {
    return res.status(403).json({
      success: false,
      message: 'Your account has been deactivated. Please contact support.',
    });
  }

  await Student.updateLastLogin(student.id);

  const token         = generateAccessToken(student);
  const refresh_token = generateRefreshToken(student);

  logger.info('Student logged in', {
    id: student.id, roll_number: student.roll_number, role: student.role,
  });

  return res.status(200).json({
    success: true,
    data: { student: safeStudent(student), token, refresh_token },
  });
});

// ============================================================================
// GET PROFILE
// ============================================================================
/**
 * GET /api/auth/profile
 * Return the authenticated student's profile. Requires verifyToken.
 */
const getProfile = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.user.id);

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  return res.status(200).json({
    success: true,
    data: { student: safeStudent(student) },
  });
});

// ============================================================================
// GET ME  (server-authoritative role check — used by frontend route guards)
// ============================================================================
/**
 * GET /api/auth/me
 * Returns the authenticated user's identity and role, verified server-side.
 * Frontend route guards MUST use this instead of decoding the JWT client-side.
 */
const getMe = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      id:          req.user.id,
      role:        req.user.role,
      name:        req.user.name,
      roll_number: req.user.roll_number,
    },
  });
});

// ============================================================================
// FIREBASE CUSTOM TOKEN  (for authenticated client-side Firestore reads)
// ============================================================================
/**
 * GET /api/auth/firebase-token
 * Returns a short-lived Firebase custom token carrying the user's role so the
 * staff dashboards can sign into Firebase Auth and be authorized by Firestore
 * Security Rules (request.auth.token.role). Requires verifyToken.
 */
const getFirebaseToken = asyncHandler(async (req, res) => {
  const firebase_token = await createFirebaseToken(req.user.id, { role: req.user.role });
  return res.status(200).json({ success: true, data: { firebase_token } });
});

// ============================================================================
// LOGOUT
// ============================================================================
/**
 * POST /api/auth/logout
 * JWT is stateless — instruct the client to discard tokens.
 */
const logout = asyncHandler(async (req, res) => {
  logger.info('Student logged out', { id: req.user?.id });
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please discard your tokens on the client.',
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
    return res.status(400).json({ success: false, message: 'refresh_token is required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired. Please log in again.',
      });
    }
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }

  // Re-fetch the student so role/active state is always current.
  const student = await Student.findById(decoded.id);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }
  if (!student.is_active) {
    return res.status(403).json({ success: false, message: 'Account is deactivated' });
  }

  const newToken = generateAccessToken(student);

  logger.info('Access token refreshed', { id: student.id });

  return res.status(200).json({ success: true, data: { token: newToken } });
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = { signup, login, getProfile, getMe, getFirebaseToken, logout, refreshToken };
