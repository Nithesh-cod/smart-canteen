// ============================================================================
// STUDENT MODEL
// ============================================================================
// Database operations for students table
// ============================================================================

const { query } = require('../config/database');

// Some methods accept an optional `client` arg so callers can run them inside
// a transaction (config/database.js `transaction(async (client) => …)`). When
// no client is supplied, the default pool-based `query()` runs the statement
// in its own connection.
const runner = (client) =>
  client
    ? (text, params) => client.query(text, params)
    : query;

// ============================================================================
// FIND OPERATIONS
// ============================================================================

/**
 * Find student by roll number
 * @param {string} rollNumber - Student roll number
 * @returns {Promise<Object|null>} Student object or null
 */
const findByRoll = async (rollNumber) => {
  const result = await query(
    'SELECT * FROM students WHERE roll_number = $1',
    [rollNumber]
  );
  return result.rows[0] || null;
};

/**
 * Find student by phone number
 * @param {string} phone - Phone number
 * @returns {Promise<Object|null>} Student object or null
 */
const findByPhone = async (phone) => {
  const result = await query(
    'SELECT * FROM students WHERE phone = $1',
    [phone]
  );
  return result.rows[0] || null;
};

/**
 * Find student by ID
 * @param {string} id - Student UUID
 * @returns {Promise<Object|null>} Student object or null
 */
const findById = async (id) => {
  const result = await query(
    'SELECT * FROM students WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Find student by roll number or phone (for login)
 * @param {string} identifier - Roll number or phone
 * @returns {Promise<Object|null>} Student object or null
 */
const findByIdentifier = async (identifier) => {
  const result = await query(
    'SELECT * FROM students WHERE roll_number = $1 OR phone = $1',
    [identifier]
  );
  return result.rows[0] || null;
};

// ============================================================================
// CREATE OPERATION
// ============================================================================

/**
 * Create a new student
 * @param {Object} studentData - Student information
 * @returns {Promise<Object>} Created student object
 */
const create = async ({ name, roll_number, phone, email, department, password_hash, role }) => {
  const result = await query(
    `INSERT INTO students
       (name, roll_number, phone, email, department, password_hash, role, points, tier, created_at, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'Bronze', NOW(), NOW())
     RETURNING *`,
    [
      name, roll_number, phone, email || null, department || null,
      password_hash || null, role || 'student',
    ]
  );
  return result.rows[0];
};

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update student profile
 * @param {string} id - Student ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated student object
 */
const updateProfile = async (id, data) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  // Build dynamic UPDATE query
  if (data.name) {
    fields.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.email) {
    fields.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.department) {
    fields.push(`department = $${paramCount++}`);
    values.push(data.department);
  }
  if (data.profile_image_url) {
    fields.push(`profile_image_url = $${paramCount++}`);
    values.push(data.profile_image_url);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(id);
  const result = await query(
    `UPDATE students SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );
  return result.rows[0];
};

/**
 * Strip secret columns from a student row before it leaves the API.
 * password_hash must NEVER reach a client — not even an admin one.
 * @param {Object|null} row
 * @returns {Object|null}
 */
const toSafe = (row) => {
  if (!row) return row;
  const { password_hash, ...safe } = row; // eslint-disable-line no-unused-vars
  return safe;
};

/**
 * List accounts filtered by role — powers the admin account-management screen.
 * @param {Object} opts
 * @param {string} [opts.role]    'student' | 'chef' | 'admin' (omit = all)
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @returns {Promise<{ accounts: Array, total: number }>} sanitized rows
 */
const listByRole = async ({ role = null, limit = 50, offset = 0 } = {}) => {
  const where  = ['1=1'];
  const params = [];

  if (role) {
    params.push(role);
    where.push(`role = $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const countResult = await query(`SELECT COUNT(*) FROM students WHERE ${whereSql}`, params);

  params.push(limit, offset);
  const result = await query(
    `SELECT * FROM students
      WHERE ${whereSql}
      ORDER BY
        CASE role WHEN 'admin' THEN 0 WHEN 'chef' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    accounts: result.rows.map(toSafe),
    total:    parseInt(countResult.rows[0].count, 10),
  };
};

/**
 * Admin-only privileged update: role, password, and/or active state.
 * Only these three columns are writable here — deliberately narrow so this
 * can never be used to overwrite arbitrary fields. Returns the sanitized row.
 * @param {string} id
 * @param {Object} data
 * @param {string}  [data.role]           'student' | 'chef' | 'admin'
 * @param {string}  [data.password_hash]  pre-hashed (never plaintext)
 * @param {boolean} [data.is_active]
 * @returns {Promise<Object|null>} sanitized updated row, or null if not found
 */
const adminUpdate = async (id, data) => {
  const fields = [];
  const values = [];
  let i = 1;

  if (data.role !== undefined) {
    fields.push(`role = $${i++}`);
    values.push(data.role);
  }
  if (data.password_hash !== undefined) {
    fields.push(`password_hash = $${i++}`);
    values.push(data.password_hash);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(data.is_active);
  }

  if (fields.length === 0) throw new Error('No fields to update');

  values.push(id);
  const result = await query(
    `UPDATE students SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return toSafe(result.rows[0] || null);
};

/**
 * Update last login timestamp
 * @param {string} id - Student ID
 * @returns {Promise<void>}
 */
const updateLastLogin = async (id) => {
  await query(
    'UPDATE students SET last_login = NOW() WHERE id = $1',
    [id]
  );
};

/**
 * Add loyalty points to student
 * @param {string} id - Student ID
 * @param {number} points - Points to add
 * @returns {Promise<Object>} Updated student
 */
const addPoints = async (id, points, client = null) => {
  const run = runner(client);
  const result = await run(
    'UPDATE students SET points = points + $1 WHERE id = $2 RETURNING *',
    [points, id]
  );
  return result.rows[0];
};

/**
 * Deduct points from student
 * @param {string} id - Student ID
 * @param {number} points - Points to deduct
 * @returns {Promise<Object>} Updated student
 */
const deductPoints = async (id, points, client = null) => {
  const run = runner(client);
  const result = await run(
    'UPDATE students SET points = GREATEST(0, points - $1) WHERE id = $2 RETURNING *',
    [points, id]
  );
  return result.rows[0];
};

/**
 * Update tier based on total spent
 * @param {string} id - Student ID
 * @returns {Promise<Object>} Updated student
 */
const updateTier = async (id, client = null) => {
  const run = runner(client);
  const result = await run(
    `UPDATE students
     SET tier = CASE
       WHEN total_spent >= 5000 THEN 'Platinum'
       WHEN total_spent >= 3000 THEN 'Gold'
       WHEN total_spent >= 1000 THEN 'Silver'
       ELSE 'Bronze'
     END
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0];
};

/**
 * Update student stats after order or refund.
 *
 * `amount` may be negative on refund — total_spent and total_orders are
 * both clamped at zero via GREATEST(0, …) so partial refunds and edge
 * cases (e.g. a refund issued before stats ever incremented) can't push
 * the columns below zero (FIX T5).
 *
 * On refund the caller passes -order.total_amount; total_orders is
 * decremented by one when amount < 0, incremented by one otherwise.
 *
 * @param {string} id - Student ID
 * @param {number} amount - Order amount (positive on pay, negative on refund)
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<Object>} Updated student
 */
const updateStats = async (id, amount, client = null) => {
  const run = runner(client);
  const orderDelta = amount < 0 ? -1 : 1;
  const result = await run(
    `UPDATE students
     SET total_spent  = GREATEST(0, total_spent  + $1),
         total_orders = GREATEST(0, total_orders + $2)
     WHERE id = $3
     RETURNING *`,
    [amount, orderDelta, id]
  );
  return result.rows[0];
};

// ============================================================================
// FAVORITES OPERATIONS
// ============================================================================

/**
 * Get student's favorite items
 * @param {string} studentId - Student ID
 * @returns {Promise<Array>} Array of menu items
 */
const getFavorites = async (studentId) => {
  const result = await query(
    `SELECT m.* FROM menu_items m
     INNER JOIN favorites f ON m.id = f.menu_item_id
     WHERE f.student_id = $1 AND m.is_available = true
     ORDER BY f.created_at DESC`,
    [studentId]
  );
  return result.rows;
};

/**
 * Add item to favorites
 * @param {string} studentId - Student ID
 * @param {number} menuItemId - Menu item ID
 * @returns {Promise<Object>} Created favorite
 */
const addToFavorites = async (studentId, menuItemId) => {
  const result = await query(
    `INSERT INTO favorites (student_id, menu_item_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, menu_item_id) DO NOTHING
     RETURNING *`,
    [studentId, menuItemId]
  );
  return result.rows[0];
};

/**
 * Remove item from favorites
 * @param {string} studentId - Student ID
 * @param {number} menuItemId - Menu item ID
 * @returns {Promise<boolean>} Success status
 */
const removeFromFavorites = async (studentId, menuItemId) => {
  const result = await query(
    'DELETE FROM favorites WHERE student_id = $1 AND menu_item_id = $2',
    [studentId, menuItemId]
  );
  return result.rowCount > 0;
};

/**
 * Check if item is favorited
 * @param {string} studentId - Student ID
 * @param {number} menuItemId - Menu item ID
 * @returns {Promise<boolean>} Is favorited
 */
const isFavorite = async (studentId, menuItemId) => {
  const result = await query(
    'SELECT id FROM favorites WHERE student_id = $1 AND menu_item_id = $2',
    [studentId, menuItemId]
  );
  return result.rows.length > 0;
};

// ============================================================================
// LIST OPERATIONS
// ============================================================================

/**
 * Get students with server-side filtering and pagination.
 *
 * Pushes tier and search into SQL with a matching COUNT(*).
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.tier]    Bronze|Silver|Gold|Platinum
 * @param {string} [opts.search]  Matched against name / roll_number / phone / email
 * @returns {Promise<{ students: Array, total: number }>}
 */
const getAll = async (opts = {}) => {
  const { limit = 50, offset = 0, tier = null, search = null } = opts;

  const where  = ['1=1'];
  const params = [];

  if (tier) {
    params.push(tier);
    where.push(`tier = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(name ILIKE $${idx} OR roll_number ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx})`);
  }
  const whereSql = where.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) FROM students WHERE ${whereSql}`,
    params
  );

  params.push(limit, offset);
  const result = await query(
    `SELECT * FROM students
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    students: result.rows,
    total:    parseInt(countResult.rows[0].count, 10),
  };
};

/**
 * Get student statistics
 * @param {string} id - Student ID
 * @returns {Promise<Object>} Student stats
 */
const getStats = async (id) => {
  const result = await query(
    `SELECT 
       s.*,
       COUNT(DISTINCT o.id) as order_count,
       COALESCE(SUM(o.total_amount), 0) as lifetime_spent,
       COUNT(DISTINCT f.menu_item_id) as favorites_count
     FROM students s
     LEFT JOIN orders o ON s.id = o.student_id AND o.payment_status = 'paid'
     LEFT JOIN favorites f ON s.id = f.student_id
     WHERE s.id = $1
     GROUP BY s.id`,
    [id]
  );
  return result.rows[0];
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  findByRoll,
  findByPhone,
  findById,
  findByIdentifier,
  create,
  toSafe,
  listByRole,
  adminUpdate,
  updateProfile,
  updateLastLogin,
  addPoints,
  deductPoints,
  updateTier,
  updateStats,
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  isFavorite,
  getAll,
  getStats
};