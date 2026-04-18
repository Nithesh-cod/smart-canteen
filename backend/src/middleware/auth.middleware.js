// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================
// JWT token verification and role-based access control
// ============================================================================

const jwt = require('jsonwebtoken');
const Student = require('../models/Student');

// ============================================================================
// VERIFY JWT TOKEN
// ============================================================================
/**
 * Verify JWT token and attach student to request
 * @middleware
 */
const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
    }

    // Check if Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token format. Use: Bearer <token>'
      });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get student from database
    const student = await Student.findById(decoded.id);

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found'
      });
    }

    if (!student.is_active) {
      return res.status(403).json({
        status: 'error',
        message: 'Account is deactivated'
      });
    }

    // Derive role from ADMIN_ROLLS / CHEF_ROLLS env vars so that
    // routes using verifyToken alone (e.g. GET /orders) get the right role.
    const adminRolls = (process.env.ADMIN_ROLLS || '').split(',').map(r => r.trim()).filter(Boolean);
    const chefRolls  = (process.env.CHEF_ROLLS  || '').split(',').map(r => r.trim()).filter(Boolean);

    let role = 'student';
    if (adminRolls.includes(student.roll_number)) {
      role = 'admin';
    } else if (chefRolls.includes(student.roll_number)) {
      role = 'chef';
    }

    // Attach student to request object
    req.user = {
      id: student.id,
      roll_number: student.roll_number,
      name: student.name,
      role
    };

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please login again.'
      });
    }

    console.error('Token verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to authenticate token',
      error: error.message
    });
  }
};

// ============================================================================
// CHECK IF ADMIN
// ============================================================================
/**
 * Check if user has admin role
 * @middleware
 * @requires verifyToken
 */
const isAdmin = (req, res, next) => {
  try {
    // This is a simplified version
    // In production, you would:
    // 1. Have an 'admins' table with admin user IDs
    // 2. OR have a 'role' field in students table
    // 3. OR use a separate admin authentication system

    // For now, check if roll number is in admin list
    const adminRolls = (process.env.ADMIN_ROLLS || '').split(',').map(r => r.trim()).filter(Boolean);

    if (!adminRolls.includes(req.user.roll_number)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin privileges required.'
      });
    }

    req.user.role = 'admin';
    next();

  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify admin privileges'
    });
  }
};

// ============================================================================
// CHECK IF CHEF
// ============================================================================
/**
 * Check if user has chef role
 * @middleware
 * @requires verifyToken
 */
const isChef = (req, res, next) => {
  try {
    // Similar to admin check
    // In production, you would have a proper role system

    const chefRolls  = (process.env.CHEF_ROLLS  || '').split(',').map(r => r.trim()).filter(Boolean);
    const adminRolls = (process.env.ADMIN_ROLLS || '').split(',').map(r => r.trim()).filter(Boolean);

    // Chef OR Admin can access
    if (!chefRolls.includes(req.user.roll_number) &&
        !adminRolls.includes(req.user.roll_number)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Chef privileges required.'
      });
    }

    req.user.role = chefRolls.includes(req.user.roll_number) ? 'chef' : 'admin';
    next();

  } catch (error) {
    console.error('Chef check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify chef privileges'
    });
  }
};

// ============================================================================
// CHECK IF OWNER OF RESOURCE
// ============================================================================
/**
 * Check if user owns the resource (e.g., their own order)
 * @middleware
 * @requires verifyToken
 * @param {Function} getResourceOwnerId - Function to get owner ID from request
 */
const isOwner = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getResourceOwnerId(req);
      
      if (req.user.id !== ownerId) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You can only access your own resources.'
        });
      }

      next();

    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to verify resource ownership'
      });
    }
  };
};

// ============================================================================
// OPTIONAL AUTH (Token not required but validated if present)
// ============================================================================
/**
 * Optional authentication - validates token if present but doesn't require it
 * @middleware
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const student = await Student.findById(decoded.id);

    if (student && student.is_active) {
      const adminRolls = (process.env.ADMIN_ROLLS || '').split(',').map(r => r.trim()).filter(Boolean);
      const chefRolls  = (process.env.CHEF_ROLLS  || '').split(',').map(r => r.trim()).filter(Boolean);
      let role = 'student';
      if (adminRolls.includes(student.roll_number)) role = 'admin';
      else if (chefRolls.includes(student.roll_number)) role = 'chef';
      req.user = {
        id: student.id,
        roll_number: student.roll_number,
        name: student.name,
        role
      };
    } else {
      req.user = null;
    }

    next();

  } catch (error) {
    // Token invalid or expired, continue without user
    req.user = null;
    next();
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  verifyToken,
  isAdmin,
  isChef,
  isOwner,
  optionalAuth
};