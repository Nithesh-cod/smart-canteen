// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================
// JWT verification and role-based access control.
//
// FIX S1/S2 — role is read from the students.role DB column, NOT from
//             ADMIN_ROLLS / CHEF_ROLLS env-var lists (which are removed).
// FIX S5    — verifyTokenOrGuest accepts a real student JWT OR a short-lived
//             guest-checkout token scoped to one order.
// ============================================================================

const jwt = require('jsonwebtoken');
const Student = require('../models/Student');

// ============================================================================
// VERIFY JWT TOKEN
// ============================================================================
/**
 * Verify the JWT and attach the student (with DB role) to req.user.
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ status: 'error', message: 'Access denied. No token provided.' });
    }
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Invalid token format. Use: Bearer <token>' });
    }

    const token   = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Guest tokens are not valid for student-authenticated routes.
    if (decoded.guest === true) {
      return res.status(401).json({ status: 'error', message: 'A full account is required for this action.' });
    }

    const student = await Student.findById(decoded.id);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }
    if (!student.is_active) {
      return res.status(403).json({ status: 'error', message: 'Account is deactivated' });
    }

    // Role is the DB column — the single source of truth.
    req.user = {
      id:          student.id,
      roll_number: student.roll_number,
      name:        student.name,
      role:        student.role || 'student',
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ status: 'error', message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Token expired. Please login again.' });
    }
    console.error('Token verification error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to authenticate token' });
  }
};

// ============================================================================
// VERIFY TOKEN OR GUEST  (FIX S5 — payment endpoints)
// ============================================================================
/**
 * Accepts either:
 *   • a normal student JWT  → req.user populated, req.guestOrderId = null
 *   • a guest-checkout JWT  → req.user = null, req.guestOrderId = <order id>
 * A token is mandatory — unauthenticated callers are rejected.
 */
const verifyTokenOrGuest = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Access denied. No token provided.' });
    }

    const token   = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Guest checkout token — scoped to exactly one order id.
    if (decoded.guest === true && decoded.order_id) {
      req.user = null;
      req.guestOrderId = decoded.order_id;
      return next();
    }

    const student = await Student.findById(decoded.id);
    if (!student) {
      return res.status(404).json({ status: 'error', message: 'Student not found' });
    }
    if (!student.is_active) {
      return res.status(403).json({ status: 'error', message: 'Account is deactivated' });
    }

    req.user = {
      id:          student.id,
      roll_number: student.roll_number,
      name:        student.name,
      role:        student.role || 'student',
    };
    req.guestOrderId = null;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Session expired. Please start the order again.' });
    }
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
};

// ============================================================================
// ROLE CHECKS  (require verifyToken first)
// ============================================================================

/** Admin-only. */
const isAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Access denied. Admin privileges required.' });
  }
  next();
};

/** Chef OR admin. */
const isChef = (req, res, next) => {
  if (!['chef', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ status: 'error', message: 'Access denied. Chef privileges required.' });
  }
  next();
};

// ============================================================================
// RESOURCE OWNERSHIP CHECK
// ============================================================================
const isOwner = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      const ownerId = await getResourceOwnerId(req);
      if (req.user.id !== ownerId) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. You can only access your own resources.',
        });
      }
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({ status: 'error', message: 'Failed to verify resource ownership' });
    }
  };
};

// ============================================================================
// OPTIONAL AUTH  (token not required, but validated if present)
// ============================================================================
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token   = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.guest === true) {
      req.user = null;
      return next();
    }

    const student = await Student.findById(decoded.id);
    if (student && student.is_active) {
      req.user = {
        id:          student.id,
        roll_number: student.roll_number,
        name:        student.name,
        role:        student.role || 'student',
      };
    } else {
      req.user = null;
    }
    next();
  } catch {
    req.user = null;
    next();
  }
};

// ============================================================================
// GUEST TOKEN ISSUER  (FIX S5)
// ============================================================================
/**
 * Issue a short-lived token that authorises payment calls for ONE specific
 * order. Used for guest (no-account) checkout.
 */
const issueGuestToken = (orderId) =>
  jwt.sign({ guest: true, order_id: orderId }, process.env.JWT_SECRET, { expiresIn: '30m' });

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  verifyToken,
  verifyTokenOrGuest,
  isAdmin,
  isChef,
  isOwner,
  optionalAuth,
  issueGuestToken,
};
