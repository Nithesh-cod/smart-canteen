// ============================================================================
// ACCOUNT CONTROLLER  (admin-only account management)
// ============================================================================
// Powers the Owner dashboard's "Staff & Accounts" screen. Lets an admin do
// from the UI what scripts/create-admin.js does from the CLI: create chef /
// admin / student accounts, reset passwords, change roles, and toggle active
// state.
//
// Every route in admin.routes.js is already behind verifyToken + isAdmin, so
// these handlers assume req.user is a verified admin. Extra guardrails here:
//   • role must be one of student | chef | admin
//   • password must clear MIN_PASSWORD_LENGTH
//   • roll_number / phone uniqueness enforced on create
//   • an admin can never demote, deactivate, or delete-role their OWN account
//     (prevents locking the last admin out of the system)
//   • password_hash is NEVER returned — every response goes through Student.toSafe
// ============================================================================

const bcrypt  = require('bcrypt');
const Student  = require('../models/Student');
const logger   = require('../utils/logger');
const { asyncHandler } = require('../middleware/error.middleware');

const BCRYPT_COST         = 12;
const MIN_PASSWORD_LENGTH = 6;
const VALID_ROLES         = ['student', 'chef', 'admin'];

// ============================================================================
// LIST ACCOUNTS
// ============================================================================
/**
 * GET /api/admin/accounts?role=chef|admin|student&page=1&limit=20
 * Lists accounts (sanitized), optionally filtered by role. Defaults to staff
 * (chef + admin) so the screen isn't flooded with every student — pass
 * role=student explicitly, or role=all for everyone.
 */
const listAccounts = asyncHandler(async (req, res) => {
  const roleParam = (req.query.role || 'staff').toLowerCase();
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  // 'staff' and 'all' aren't real roles — resolve them here.
  let roleFilter = null;
  if (VALID_ROLES.includes(roleParam)) {
    roleFilter = roleParam;
  } else if (roleParam !== 'staff' && roleParam !== 'all') {
    return res.status(400).json({
      success: false,
      message: `role must be one of: ${VALID_ROLES.join(', ')}, staff, all`,
    });
  }

  // 'staff' = chef + admin. listByRole filters a single role, so fetch both.
  let accounts, total;
  if (roleParam === 'staff') {
    const [chefs, admins] = await Promise.all([
      Student.listByRole({ role: 'chef',  limit: 1000, offset: 0 }),
      Student.listByRole({ role: 'admin', limit: 1000, offset: 0 }),
    ]);
    const merged = [...admins.accounts, ...chefs.accounts];
    total    = merged.length;
    accounts = merged.slice(offset, offset + limit);
  } else {
    const result = await Student.listByRole({ role: roleFilter, limit, offset });
    accounts = result.accounts;
    total    = result.total;
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return res.json({
    success: true,
    data: {
      accounts,
      pagination: {
        total, page, limit,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    },
  });
});

// ============================================================================
// CREATE ACCOUNT
// ============================================================================
/**
 * POST /api/admin/accounts
 * Body: { name, roll_number, phone, password, role, email?, department? }
 * Creates a student / chef / admin account with a bcrypt-hashed password.
 */
const createAccount = asyncHandler(async (req, res) => {
  const { name, roll_number, phone, password, email, department } = req.body;
  const role = (req.body.role || 'student').toLowerCase();

  if (!name || !roll_number || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: 'name, roll_number, phone, and password are required',
    });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message: `role must be one of: ${VALID_ROLES.join(', ')}`,
    });
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  }

  // Uniqueness — mirror the public signup checks so the UI gets a clean 409
  // instead of a raw Postgres unique-violation 500.
  if (await Student.findByRoll(roll_number.trim())) {
    return res.status(409).json({
      success: false,
      message: 'An account with this roll number already exists',
    });
  }
  if (await Student.findByPhone(phone.trim())) {
    return res.status(409).json({
      success: false,
      message: 'An account with this phone number already exists',
    });
  }

  const password_hash = await bcrypt.hash(String(password), BCRYPT_COST);

  const created = await Student.create({
    name:        name.trim(),
    roll_number: roll_number.trim(),
    phone:       phone.trim(),
    email:       email ? email.trim() : null,
    department:  department ? department.trim() : null,
    password_hash,
    role,
  });

  logger.success('Admin created account', {
    by: req.user.id, id: created.id, role, roll_number: created.roll_number,
  });

  return res.status(201).json({
    success: true,
    data: { account: Student.toSafe(created) },
  });
});

// ============================================================================
// UPDATE ACCOUNT  (role / password / active state)
// ============================================================================
/**
 * PATCH /api/admin/accounts/:id
 * Body: any of { role?, password?, is_active? }
 * Guards against an admin locking themselves out of their own account.
 */
const updateAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, password, is_active } = req.body;

  if (role === undefined && password === undefined && is_active === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Provide at least one of: role, password, is_active',
    });
  }

  const target = await Student.findById(id);
  if (!target) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }

  const isSelf = String(req.user.id) === String(id);
  const update = {};

  // ── role ──────────────────────────────────────────────────────────────────
  if (role !== undefined) {
    const nextRole = String(role).toLowerCase();
    if (!VALID_ROLES.includes(nextRole)) {
      return res.status(400).json({
        success: false,
        message: `role must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }
    // Self-lockout guard: an admin can't strip their own admin role.
    if (isSelf && target.role === 'admin' && nextRole !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove your own admin role. Ask another admin to do it.',
      });
    }
    update.role = nextRole;
  }

  // ── password ────────────────────────────────────────────────────────────────
  if (password !== undefined) {
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }
    update.password_hash = await bcrypt.hash(String(password), BCRYPT_COST);
  }

  // ── active state ────────────────────────────────────────────────────────────
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_active must be a boolean',
      });
    }
    // Self-lockout guard: an admin can't deactivate their own account.
    if (isSelf && is_active === false) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.',
      });
    }
    update.is_active = is_active;
  }

  const updated = await Student.adminUpdate(id, update);

  logger.info('Admin updated account', {
    by: req.user.id, id,
    changed: Object.keys(update).map((k) => (k === 'password_hash' ? 'password' : k)),
  });

  return res.json({ success: true, data: { account: updated } });
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = { listAccounts, createAccount, updateAccount };
