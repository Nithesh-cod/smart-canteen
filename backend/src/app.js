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

// Production hard-stop: a missing webhook secret silently turns every
// payment.captured into a 500, which Razorpay treats as retryable and
// hammers in a redelivery storm. Fail fast on boot so the operator notices
// and sets the env var before payments start landing.
if (process.env.NODE_ENV === 'production' && !process.env.RAZORPAY_WEBHOOK_SECRET) {
  console.error(
    '\n❌  RAZORPAY_WEBHOOK_SECRET is not set.\n' +
    '    Refusing to start in production — every webhook would otherwise\n' +
    '    return 500 and Razorpay would retry indefinitely.\n' +
    '    Set the secret in your Render/host env, then restart.\n'
  );
  process.exit(1);
}

// Cart stock holds are shared state across every server instance. Without a
// shared store each instance keeps a private availability count and the same
// last item can be sold once per instance. Fail on boot rather than oversell.
require('./services/stock.service').assertProductionReady();

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

    // A plain Error here surfaces as 500, which reads as "the backend is
    // broken" when the truth is "this origin isn't in FRONTEND_URLS" — and it
    // sends you debugging the wrong system entirely. 403 says the request was
    // understood and refused, and the log names the origin so the fix is
    // obvious from the Render logs alone.
    console.warn(
      `[CORS] rejected origin "${origin}" — add it to FRONTEND_URLS ` +
      `(currently: ${allowedOrigins.join(', ')})`
    );
    const err = new Error(
      `Origin "${origin}" is not allowed. Add it to the FRONTEND_URLS ` +
      `environment variable on the API service.`
    );
    err.status = 403;
    callback(err);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // X-Cart-Token carries the signed cart identity for stock holds. The browser
  // preflights any request bearing a non-standard header, and a header missing
  // from this list fails that preflight — which blocks the WHOLE request, not
  // just the header. Omitting it took down every cross-origin call the kiosk
  // makes, including plain menu reads that have nothing to do with carts,
  // because the interceptor attaches the token to all of them.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Token'],
};

const io = require('socket.io')(http, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// ============================================================================
// MULTI-INSTANCE SOCKET FANOUT
// ============================================================================
// Socket.IO rooms live in the memory of ONE process. With several instances
// behind a load balancer, a chef connected to instance A simply never receives
// an `order:new` emitted from instance B — the kitchen silently misses orders,
// and it looks like a flaky network rather than a missing adapter. That makes
// horizontal scaling impossible without this.
//
// The Redis adapter republishes every emit over pub/sub so all instances
// deliver it. Skipped when REDIS_URL is unset: a single dev instance needs no
// fanout, and app boot already refuses to run production without Redis.
if (process.env.REDIS_URL) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const Redis = require('ioredis');
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate(); // pub/sub needs its own connection
    pubClient.on('error', (e) => console.error('[socket.io] redis pub error:', e.message));
    subClient.on('error', (e) => console.error('[socket.io] redis sub error:', e.message));
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[socket.io] Redis adapter active — safe to run multiple instances');
  } catch (err) {
    console.error('[socket.io] Redis adapter failed to load:', err.message);
    console.error('[socket.io] Running WITHOUT fanout — do not scale past one instance.');
  }
} else {
  console.log('[socket.io] No REDIS_URL — single-instance fanout only');
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet());

// CORS — allow all dashboard ports
app.use(cors(corsOptions));

// Razorpay webhook (FIX C3) — MUST be mounted before express.json() so the
// HMAC verifier sees the untouched request body. If express.json() runs first
// it re-stringifies the body with different whitespace/key-ordering and the
// signature check fails on every webhook.
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  require('./controllers/payment.controller').handleWebhook
);

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

// Rate-limit key for anonymous callers.
//
// Keying raw `req.ip` gives every IPv6 address its own bucket, but a single
// residential IPv6 allocation is a /64 — 18 quintillion addresses the same
// client can rotate through for free. That makes the order limiter below a
// no-op against any IPv6 client. Collapse v6 addresses to their /64 prefix so
// the whole allocation shares one bucket; v4 addresses are used as-is.
const ipBucket = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  // ::ffff:1.2.3.4 is an IPv4 address in v6 clothing — treat it as v4.
  if (!ip.includes(':') || ip.startsWith('::ffff:')) return ip;
  return ip.split(':').slice(0, 4).join(':') + '::/64';
};

// Strict limiter only for order creation (prevent order spam in production)
const orderCreateLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1 minute window
  max: isDev ? 200 : 10,         // 10 orders/min in prod, unlimited in dev
  skip: skipLocalhost,
  keyGenerator: (req) => req.headers.authorization || ipBucket(req),
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
app.use('/api/cart', require('./routes/cart.routes'));

// ============================================================================
// STOCK HOLD SWEEPER
// ============================================================================
// Abandoned carts must give their stock back on their own — a student who
// closes the tab mid-order would otherwise hold the last three samosas until
// the process restarted. The sweeper returns anything past its TTL and
// broadcasts the recovered availability so every client repaints.
const stockService = require('./services/stock.service');
const { broadcastAvailability } = require('./controllers/cart.controller');

stockService.startSweeper((freed) => {
  broadcastAvailability(io, freed);
  console.log(`[stock] swept ${freed.length} expired hold(s) back into availability`);
});

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

// Only start listening when run directly (node src/app.js). When required as a
// module — e.g. by supertest in the test suite — we export the app WITHOUT
// binding a port or opening sockets, so tests drive it via ephemeral servers.
if (require.main === module) {
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
}

module.exports = app;