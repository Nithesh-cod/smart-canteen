// ============================================================================
// SMART CANTEEN - Main Express Application
// ============================================================================
// This is the entry point for the backend server
// ============================================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();

// Trust the first proxy hop (Render / Vercel / nginx sit in front of Express).
// Required for express-rate-limit to read X-Forwarded-For correctly.
app.set('trust proxy', 1);

const http = require('http').createServer(app);

// ─── Allowed origins ──────────────────────────────────────────────────────────
// Dev:  Single Vite dev server on port 3000 (all panels at /chef, /owner, /)
// Prod: Same origin — frontend is served by this Express server, so CORS is
//       not required, but we keep it permissive for any external API callers.
// Extra origins can be added via FRONTEND_URLS (comma-separated) in .env.
const buildAllowedOrigins = () => {
  const extras = (process.env.FRONTEND_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([
    'http://localhost:3000', // single Vite dev server
    ...extras,
  ]));
};

const allowedOrigins = buildAllowedOrigins();
console.log('[CORS] Allowed origins:', allowedOrigins.join(', '));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const io = require('socket.io')(http, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet());

// CORS — allow all dashboard ports
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
// Dev: generous limits so 3 dashboards + React StrictMode double-invocation
//      + polling don't trip the limiter on localhost.
// Prod: tighter limits applied only to public write/order endpoints.
const isDev = process.env.NODE_ENV !== 'production';

// Skip rate-limiting entirely for localhost in development
const skipLocalhost = (req) => {
  if (!isDev) return false;
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

// General API limiter — very permissive in dev
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: isDev ? 2000 : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200),
  skip: skipLocalhost,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// Strict limiter only for order creation (prevent order spam in production)
const orderCreateLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1 minute window
  max: isDev ? 200 : 10,         // 10 orders/min in prod, unlimited in dev
  skip: skipLocalhost,
  keyGenerator: (req) => req.headers.authorization || req.ip,
  message: { success: false, message: 'Too many orders placed. Please wait a moment.' },
});

app.use('/api/', limiter);
// Apply strict limiter only to POST /api/orders (order creation)
app.use('/api/orders', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/') return orderCreateLimiter(req, res, next);
  next();
});

// ============================================================================
// SOCKET.IO SETUP
// ============================================================================

// Make io accessible to routes
app.set('io', io);

// Socket.io connection handling
const setupSocketHandlers = require('./sockets/orderSocket');
setupSocketHandlers(io);

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/students', require('./routes/student.routes'));
app.use('/api/menu', require('./routes/menu.routes'));
app.use('/api/orders', require('./routes/order.routes'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

// ============================================================================
// STATIC FILE SERVING (production only)
// ============================================================================
// In production the Express server serves the compiled React SPA directly.
// The frontend is built into frontend/dist/ via `npm run build`.
// Every non-API GET request falls back to index.html so React Router works.

// Only serve the React SPA when the built dist/ folder actually exists
// (monorepo / single-server deploy). When frontend is on Vercel this
// block is skipped entirely — no ENOENT errors.
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const distPath = path.resolve(__dirname, '../../frontend/dist');

  if (fs.existsSync(distPath)) {
    // Serve static assets (JS, CSS, images …)
    app.use(express.static(distPath, { index: false }));

    // SPA fallback: any GET that didn't match an API route → send index.html
    app.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/socket.io') ||
        req.path === '/health'
      ) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });

    console.log(`[Static] Serving React SPA from ${distPath}`);
  } else {
    console.log('[Static] No frontend/dist found — API-only mode (frontend on Vercel)');
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler (only reached for unmatched API routes in production)
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// SERVER START
// ============================================================================

const PORT = process.env.PORT || 5000;

http.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🚀 Smart Canteen Server is running!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.io: Enabled`);
  console.log('═══════════════════════════════════════════════════════');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  http.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;