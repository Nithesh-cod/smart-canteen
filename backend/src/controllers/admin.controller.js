// ============================================================================
// ADMIN CONTROLLER
// ============================================================================
// Handles all admin-only HTTP requests:
// dashboard, salesReport, revenue, students, studentDetail,
// toggleStudentStatus, orders, bulkUpdateMenuAvailability, systemHealth
// ============================================================================

const Order    = require('../models/Order');
const Student  = require('../models/Student');
const MenuItem = require('../models/MenuItem');
const logger   = require('../utils/logger');
const { asyncHandler } = require('../middleware/error.middleware');
const { getConnectedClientsCount } = require('../sockets/orderSocket');

// ============================================================================
// DASHBOARD
// ============================================================================
/**
 * GET /api/admin/dashboard
 * Auth: admin
 *
 * Returns today/week/month revenue, pending orders, top 5 items,
 * recent 10 orders, and student tier distribution.
 */
const getDashboard = asyncHandler(async (req, res) => {
  // Revenue & order counts
  const stats = await Order.getStats();

  // Top 5 selling items (last 30 days)
  const topItems = await MenuItem.getTopSelling(5);

  // Recent 10 orders
  const recentOrders = await Order.getAll({ limit: 10, offset: 0 });

  // Pending orders count (from today's status_breakdown)
  const pendingEntry = (stats.status_breakdown || []).find(s => s.status === 'pending');
  const pendingCount = pendingEntry ? parseInt(pendingEntry.count) : 0;

  // Student tier distribution
  let tierDistribution = [];
  try {
    const { students: allStudents } = await Student.getAll(1000, 0);
    const tierCounts = allStudents.reduce((acc, s) => {
      acc[s.tier] = (acc[s.tier] || 0) + 1;
      return acc;
    }, {});
    tierDistribution = Object.entries(tierCounts).map(([tier, count]) => ({ tier, count }));
  } catch (err) {
    logger.warn('Could not compute tier distribution', err);
  }

  return res.json({
    success: true,
    data: {
      revenue: {
        today: {
          amount:      parseFloat(stats.today.revenue),
          order_count: parseInt(stats.today.order_count)
        },
        week: {
          amount:      parseFloat(stats.week.revenue),
          order_count: parseInt(stats.week.order_count)
        },
        month: {
          amount:      parseFloat(stats.month.revenue),
          order_count: parseInt(stats.month.order_count)
        }
      },
      pending_orders:     pendingCount,
      status_breakdown:   stats.status_breakdown,
      top_items:          topItems,
      recent_orders:      recentOrders,
      tier_distribution:  tierDistribution
    }
  });
});

// ============================================================================
// SALES REPORT
// ============================================================================
/**
 * GET /api/admin/sales-report
 * Query: { start_date, end_date, group_by: 'day'|'week'|'month' }
 * Auth: admin
 *
 * Returns aggregated revenue data suitable for charting.
 */
const getSalesReport = asyncHandler(async (req, res) => {
  const {
    start_date,
    end_date,
    group_by = 'day'
  } = req.query;

  // Derive days range from start/end dates, defaulting to last 30 days
  let days = 30;
  if (start_date && end_date) {
    const start = new Date(start_date);
    const end   = new Date(end_date);
    if (!isNaN(start) && !isNaN(end)) {
      days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    }
  }

  // getRevenueData returns daily rows; we group them client-side per group_by
  const dailyData = await Order.getRevenueData(days);

  let report;
  if (group_by === 'day') {
    report = dailyData;
  } else if (group_by === 'week') {
    report = groupByPeriod(dailyData, 'week');
  } else if (group_by === 'month') {
    report = groupByPeriod(dailyData, 'month');
  } else {
    report = dailyData;
  }

  // Totals
  const totalRevenue    = report.reduce((s, r) => s + parseFloat(r.revenue), 0);
  const totalOrderCount = report.reduce((s, r) => s + parseInt(r.order_count), 0);

  return res.json({
    success: true,
    data: {
      group_by,
      start_date: start_date || null,
      end_date:   end_date   || null,
      report,
      summary: {
        total_revenue:     parseFloat(totalRevenue.toFixed(2)),
        total_order_count: totalOrderCount
      }
    }
  });
});

// ============================================================================
// REVENUE CHART DATA
// ============================================================================
/**
 * GET /api/admin/revenue
 * Query: { period: '7days'|'30days'|'90days' }
 * Auth: admin
 *
 * Returns a daily revenue array for a line/bar chart.
 */
const getRevenue = asyncHandler(async (req, res) => {
  const periodMap = { '7days': 7, '30days': 30, '90days': 90 };
  const period    = req.query.period || '30days';
  const days      = periodMap[period] || 30;

  const revenueData = await Order.getRevenueData(days);

  return res.json({
    success: true,
    data: {
      period,
      days,
      revenue: revenueData
    }
  });
});

// ============================================================================
// GET STUDENTS (PAGINATED)
// ============================================================================
/**
 * GET /api/admin/students
 * Query: { page, limit, tier, search }
 * Auth: admin
 */
const getStudents = asyncHandler(async (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const tier   = req.query.tier   || null;
  const search = req.query.search || null;

  const offset = (page - 1) * limit;

  // Student.getAll only supports limit/offset — fetch a larger batch and
  // filter in-process when tier/search filters are requested
  let { students, total } = await Student.getAll(
    tier || search ? 1000 : limit,   // fetch more if we need to filter
    tier || search ? 0    : offset
  );

  // Apply optional in-memory filters
  if (tier) {
    students = students.filter(s => s.tier === tier);
  }

  if (search) {
    const q = search.toLowerCase();
    students = students.filter(
      s =>
        (s.name         && s.name.toLowerCase().includes(q))      ||
        (s.roll_number  && s.roll_number.toLowerCase().includes(q)) ||
        (s.phone        && s.phone.includes(q))                    ||
        (s.email        && s.email && s.email.toLowerCase().includes(q))
    );
  }

  // If filters were applied we need to re-paginate manually
  if (tier || search) {
    total    = students.length;
    students = students.slice(offset, offset + limit);
  }

  const totalPages = Math.ceil(total / limit);

  return res.json({
    success: true,
    data: {
      students,
      pagination: {
        total,
        page,
        limit,
        total_pages: totalPages,
        has_next:    page < totalPages,
        has_prev:    page > 1
      }
    }
  });
});

// ============================================================================
// GET STUDENT DETAIL
// ============================================================================
/**
 * GET /api/admin/students/:studentId
 * Auth: admin
 *
 * Returns the student record with full lifetime stats and recent orders.
 */
const getStudentDetail = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await Student.getStats(studentId);

  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  // Recent 10 orders for this student
  const recentOrders = await Order.getByStudent(studentId, 10);

  return res.json({
    success: true,
    data: {
      student,
      recent_orders: recentOrders
    }
  });
});

// ============================================================================
// TOGGLE STUDENT STATUS
// ============================================================================
/**
 * PATCH /api/admin/students/:studentId/status
 * Body: { is_active: boolean }
 * Auth: admin
 */
const toggleStudentStatus = asyncHandler(async (req, res) => {
  const { studentId }  = req.params;
  const { is_active }  = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'is_active must be a boolean (true or false)'
    });
  }

  // Student.updateProfile handles is_active if the DB column exists.
  // We pass it via a direct query since updateProfile only allows select fields.
  // Re-use the query utility through the model's connection.
  const { query } = require('../config/database');

  const result = await query(
    'UPDATE students SET is_active = $1 WHERE id = $2 RETURNING *',
    [is_active, studentId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const updatedStudent = result.rows[0];

  logger.info(`Student ${studentId} (${updatedStudent.name}) is_active set to ${is_active}`);

  return res.json({
    success: true,
    data: { student: updatedStudent }
  });
});

// ============================================================================
// GET ORDERS (ADMIN FULL FILTER)
// ============================================================================
/**
 * GET /api/admin/orders
 * Query: { status, payment_status, from_date, to_date, search, page, limit }
 * Auth: admin
 */
const getOrders = asyncHandler(async (req, res) => {
  const {
    status,
    payment_status,
    from_date,
    to_date,
    search,
    page  = 1,
    limit = 20
  } = req.query;

  const parsedLimit  = parseInt(limit);
  const parsedOffset = (parseInt(page) - 1) * parsedLimit;

  const filters = {
    status:         status         || undefined,
    payment_status: payment_status || undefined,
    from_date:      from_date      || undefined,
    to_date:        to_date        || undefined,
    limit:          search ? 1000 : parsedLimit,  // fetch more if searching by student
    offset:         search ? 0    : parsedOffset
  };

  let orders = await Order.getAll(filters);

  // In-memory search on student name / roll number
  if (search) {
    const q = search.toLowerCase();
    orders = orders.filter(
      o =>
        (o.student_name && o.student_name.toLowerCase().includes(q)) ||
        (o.student_roll && o.student_roll.toLowerCase().includes(q)) ||
        (o.order_number && o.order_number.toLowerCase().includes(q))
    );
  }

  const total = orders.length;

  if (search) {
    orders = orders.slice(parsedOffset, parsedOffset + parsedLimit);
  }

  return res.json({
    success: true,
    data: {
      orders,
      pagination: {
        total,
        page:        parseInt(page),
        limit:       parsedLimit,
        total_pages: Math.ceil(total / parsedLimit)
      }
    }
  });
});

// ============================================================================
// BULK UPDATE MENU AVAILABILITY
// ============================================================================
/**
 * PATCH /api/admin/menu/bulk-availability
 * Body: { items: [{ id, is_available }] }
 * Auth: admin
 *
 * Updates availability for multiple menu items in one call.
 * Groups items by target availability to minimise DB round-trips.
 */
const bulkUpdateMenuAvailability = asyncHandler(async (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'items must be a non-empty array of { id, is_available } objects'
    });
  }

  // Validate each entry
  for (const item of items) {
    if (!item.id || typeof item.is_available !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Each item must have an id (number) and is_available (boolean)'
      });
    }
  }

  // Group by desired availability value so we can batch-update
  const enableIds  = items.filter(i =>  i.is_available).map(i => i.id);
  const disableIds = items.filter(i => !i.is_available).map(i => i.id);

  let updatedCount = 0;

  if (enableIds.length > 0) {
    updatedCount += await MenuItem.bulkUpdateAvailability(enableIds, true);
  }
  if (disableIds.length > 0) {
    updatedCount += await MenuItem.bulkUpdateAvailability(disableIds, false);
  }

  // Broadcast menu change via sockets
  const io = req.app.get('io');
  if (io) {
    io.emit('menu:bulk-updated', {
      updated_count: updatedCount,
      enabled_ids:   enableIds,
      disabled_ids:  disableIds,
      timestamp:     new Date().toISOString()
    });
  }

  logger.success(`Bulk menu availability updated: ${updatedCount} items affected`);

  return res.json({
    success: true,
    data: {
      updated_count: updatedCount,
      enabled_ids:   enableIds,
      disabled_ids:  disableIds
    }
  });
});

// ============================================================================
// SYSTEM HEALTH
// ============================================================================
/**
 * GET /api/admin/health
 * Auth: admin
 *
 * Returns server uptime, DB status, printer status, and active socket counts.
 */
const getSystemHealth = asyncHandler(async (req, res) => {
  const uptimeSeconds = process.uptime();

  // DB connectivity check — run a lightweight query
  let dbStatus = 'connected';
  try {
    const { query } = require('../config/database');
    await query('SELECT 1');
  } catch {
    dbStatus = 'disconnected';
  }

  // Printer connectivity check
  let printerStatus = 'unknown';
  try {
    const printerService = require('../services/printer.service');
    const isConnected    = await printerService.checkPrinterStatus();
    printerStatus = isConnected ? 'connected' : 'disconnected';
  } catch {
    printerStatus = 'unavailable';
  }

  // Active socket connections
  let socketConnections = { students: 0, chefs: 0, owners: 0, total: 0 };
  try {
    socketConnections = getConnectedClientsCount();
  } catch {
    // getConnectedClientsCount may throw if called before setup
  }

  const uptimeFormatted = formatUptime(uptimeSeconds);

  return res.json({
    success: true,
    data: {
      server: {
        status:           'running',
        uptime_seconds:   Math.floor(uptimeSeconds),
        uptime_formatted: uptimeFormatted,
        node_version:     process.version,
        memory_usage_mb:  parseFloat(
          (process.memoryUsage().rss / 1024 / 1024).toFixed(2)
        ),
        environment: process.env.NODE_ENV || 'development'
      },
      database: {
        status: dbStatus
      },
      printer: {
        status: printerStatus
      },
      sockets: socketConnections,
      timestamp: new Date().toISOString()
    }
  });
});

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Format uptime seconds into a human-readable string
 */
const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
};

/**
 * Group daily revenue rows by 'week' or 'month' period label
 */
const groupByPeriod = (dailyRows, period) => {
  const grouped = {};

  for (const row of dailyRows) {
    const d   = new Date(row.date);
    let label;

    if (period === 'week') {
      // ISO week: find Monday of the week
      const day    = d.getDay() || 7;          // 1=Mon … 7=Sun
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day - 1));
      label = monday.toISOString().slice(0, 10);
    } else {
      // month: YYYY-MM
      label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!grouped[label]) {
      grouped[label] = { date: label, order_count: 0, revenue: 0 };
    }
    grouped[label].order_count += parseInt(row.order_count);
    grouped[label].revenue     += parseFloat(row.revenue);
  }

  return Object.values(grouped).sort((a, b) => (a.date > b.date ? 1 : -1));
};

// ============================================================================
// OFFERS CRUD
// ============================================================================
/**
 * GET /api/admin/offers  — list all offers
 * POST /api/admin/offers — create an offer
 * PUT /api/admin/offers/:id — update an offer
 * DELETE /api/admin/offers/:id — delete an offer
 * PATCH /api/admin/offers/:id/toggle — flip is_active
 */
const { query: dbQuery } = require('../config/database');

const getOffers = asyncHandler(async (req, res) => {
  const result = await dbQuery(
    'SELECT * FROM offers ORDER BY created_at DESC'
  );
  return res.json({ success: true, data: result.rows });
});

const createOffer = asyncHandler(async (req, res) => {
  const {
    title, description = '',
    discount_percentage = null, discount_amount = null,
    min_order_amount = null, valid_from, valid_until,
    is_active = true,
  } = req.body;

  if (!title || !valid_from || !valid_until) {
    return res.status(400).json({
      success: false,
      message: 'title, valid_from and valid_until are required'
    });
  }

  const result = await dbQuery(
    `INSERT INTO offers
       (title, description, discount_percentage, discount_amount,
        min_order_amount, valid_from, valid_until, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [title, description, discount_percentage, discount_amount,
     min_order_amount, valid_from, valid_until, is_active]
  );

  return res.status(201).json({ success: true, data: result.rows[0] });
});

const updateOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title, description, discount_percentage, discount_amount,
    min_order_amount, valid_from, valid_until, is_active,
  } = req.body;

  const result = await dbQuery(
    `UPDATE offers SET
       title               = COALESCE($1, title),
       description         = COALESCE($2, description),
       discount_percentage = $3,
       discount_amount     = $4,
       min_order_amount    = $5,
       valid_from          = COALESCE($6, valid_from),
       valid_until         = COALESCE($7, valid_until),
       is_active           = COALESCE($8, is_active)
     WHERE id = $9
     RETURNING *`,
    [title, description, discount_percentage ?? null, discount_amount ?? null,
     min_order_amount ?? null, valid_from, valid_until, is_active, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Offer not found' });
  }

  return res.json({ success: true, data: result.rows[0] });
});

const deleteOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await dbQuery('DELETE FROM offers WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Offer not found' });
  }
  return res.status(204).send();
});

const toggleOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await dbQuery(
    'UPDATE offers SET is_active = NOT is_active WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Offer not found' });
  }
  return res.json({ success: true, data: result.rows[0] });
});

// ============================================================================
// EXPORTS
// ============================================================================
// ============================================================================
// STUB HANDLERS — Advanced analytics and reporting
// These return placeholder data; replace with real queries when needed.
// ============================================================================

const getPendingOrders = asyncHandler(async (req, res) => {
  const orders = await Order.getAll({ status: 'pending', limit: 200, offset: 0 });
  return res.json({ success: true, data: { count: orders.length, orders } });
});

const getAnalyticsOverview = asyncHandler(async (req, res) => {
  // Re-use getDashboard data for now
  return res.json({
    success: true,
    data: { message: 'Analytics overview — use /dashboard for full stats' }
  });
});

const getTrends = asyncHandler(async (req, res) => {
  return res.json({ success: true, data: { trends: [] } });
});

const getPeakHours = asyncHandler(async (req, res) => {
  return res.json({ success: true, data: { peak_hours: [] } });
});

const getDailyReport = asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const orders = await Order.getAll({ from_date: date, to_date: date, limit: 500, offset: 0 });
  const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
  return res.json({ success: true, data: { date, orders, revenue, count: orders.length } });
});

const getMonthlyReport = asyncHandler(async (req, res) => {
  return res.json({ success: true, data: { message: 'Monthly report — use /sales for detailed data' } });
});

const exportReport = asyncHandler(async (req, res) => {
  return res.status(501).json({ success: false, message: 'Export not yet implemented' });
});

const getLogs = asyncHandler(async (req, res) => {
  return res.json({ success: true, data: { logs: [] } });
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  getDashboard,
  getSalesReport,
  getRevenue,
  getStudents,
  getStudentDetail,
  toggleStudentStatus,
  getOrders,
  getPendingOrders,
  bulkUpdateMenuAvailability,
  getSystemHealth,
  getAnalyticsOverview,
  getTrends,
  getPeakHours,
  getDailyReport,
  getMonthlyReport,
  exportReport,
  getLogs,
  getOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOffer,
};
