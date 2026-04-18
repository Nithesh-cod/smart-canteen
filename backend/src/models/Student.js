// ============================================================================
// STUDENT MODEL
// ============================================================================
// Database operations for students table
// ============================================================================

const { query } = require('../config/database');

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
const create = async ({ name, roll_number, phone, email, department }) => {
  const result = await query(
    `INSERT INTO students (name, roll_number, phone, email, department, points, tier, created_at, last_login)
     VALUES ($1, $2, $3, $4, $5, 0, 'Bronze', NOW(), NOW())
     RETURNING *`,
    [name, roll_number, phone, email || null, department || null]
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
const addPoints = async (id, points) => {
  const result = await query(
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
const deductPoints = async (id, points) => {
  const result = await query(
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
const updateTier = async (id) => {
  const result = await query(
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
 * Update student stats after order
 * @param {string} id - Student ID
 * @param {number} amount - Order amount
 * @returns {Promise<Object>} Updated student
 */
const updateStats = async (id, amount) => {
  const result = await query(
    `UPDATE students 
     SET total_spent = total_spent + $1,
         total_orders = total_orders + 1
     WHERE id = $2
     RETURNING *`,
    [amount, id]
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
 * Get all students with pagination
 * @param {number} limit - Number of records
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Object>} Students array and total count
 */
const getAll = async (limit = 50, offset = 0) => {
  const result = await query(
    `SELECT * FROM students
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  
  const countResult = await query('SELECT COUNT(*) FROM students');
  
  return {
    students: result.rows,
    total: parseInt(countResult.rows[0].count)
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