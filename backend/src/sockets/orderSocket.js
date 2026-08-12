// ============================================================================
// SOCKET.IO - REAL-TIME ORDER UPDATES
// ============================================================================
// WebSocket handlers for real-time communication between
// Student Kiosk, Chef Display, and Owner Dashboard
// ============================================================================

const logger = require('../utils/logger');

// Store connected clients by role
const connectedClients = {
  students: new Map(), // studentId -> socket
  chefs: new Set(),    // Set of chef sockets
  owners: new Set()    // Set of owner sockets
};

// ============================================================================
// SETUP SOCKET HANDLERS
// ============================================================================
/**
 * Setup Socket.io event handlers
 * @param {object} io - Socket.io server instance
 */
const setupSocketHandlers = (io) => {
  
  io.on('connection', (socket) => {
    logger.info(`🔌 New socket connection: ${socket.id}`);

    // ========================================================================
    // CLIENT IDENTIFICATION
    // ========================================================================
    
    /**
     * Student joins their personal room
     * @event student:join
     * @param {string} studentId - Student UUID
     */
    socket.on('student:join', (studentId) => {
      socket.join(`student:${studentId}`);
      connectedClients.students.set(studentId, socket);
      logger.success(`👤 Student ${studentId} joined their room`);
      
      // Send confirmation
      socket.emit('joined', {
        role: 'student',
        studentId,
        message: 'Connected to order updates'
      });
    });

    /**
     * Chef joins the kitchen room
     * @event chef:join
     */
    socket.on('chef:join', () => {
      socket.join('kitchen');
      connectedClients.chefs.add(socket);
      logger.success(`👨‍🍳 Chef joined kitchen room`);
      
      // Send confirmation
      socket.emit('joined', {
        role: 'chef',
        message: 'Connected to kitchen display'
      });
    });

    /**
     * Owner joins the admin room
     * @event owner:join
     */
    socket.on('owner:join', () => {
      socket.join('admin');
      connectedClients.owners.add(socket);
      logger.success(`👔 Owner joined admin room`);

      // Send confirmation
      socket.emit('joined', {
        role: 'owner',
        message: 'Connected to admin dashboard'
      });
    });

    /**
     * Join a per-order room. Used by the public tracking page and by guest
     * kiosks that have no student account to subscribe to. The controller
     * fans out order:status-change / order:ready-alert here too so guests
     * receive the same realtime updates as logged-in students.
     * @event order:join
     * @param {string|number} orderId
     */
    socket.on('order:join', (orderId) => {
      if (orderId === undefined || orderId === null || orderId === '') return;
      socket.join(`order:${orderId}`);
    });

    // ========================================================================
    // ORDER / MENU / PAYMENT EVENTS — deliberately NOT accepted from clients
    // ========================================================================
    // This server used to relay `order:created`, `order:status-updated`,
    // `order:cancelled`, `menu:availability-changed` and `payment:success`
    // straight from whatever socket emitted them back out to the `kitchen`,
    // `admin` and `student:<id>` rooms.
    //
    // Socket connections carry no authentication, so ANY browser that could
    // reach the server could forge those events: fake "your order is ready"
    // and "Payment successful!" notifications to a student, phantom orders on
    // the chef display, or bogus stock/availability changes on every kiosk.
    //
    // Every one of these events is already emitted server-side, from the
    // controllers, after the corresponding write commits and the caller's
    // role/ownership has been checked (order.controller.updateStatus / cancel,
    // payment.controller.finalisePayment, …). The relays were pure attack
    // surface with no legitimate producer — the frontend only ever emits the
    // four join events handled above (see socket.service.ts). They are removed
    // rather than authenticated; re-adding them would need a real socket
    // handshake (JWT in `auth`) plus a server-side role check, and would still
    // duplicate what the controllers already broadcast.
    // ========================================================================

    // ========================================================================
    // DISCONNECTION
    // ========================================================================

    socket.on('disconnect', () => {
      logger.warn(`🔌 Socket disconnected: ${socket.id}`);
      
      // Remove from connected clients
      for (const [studentId, studentSocket] of connectedClients.students.entries()) {
        if (studentSocket.id === socket.id) {
          connectedClients.students.delete(studentId);
          logger.info(`👤 Student ${studentId} disconnected`);
          break;
        }
      }
      
      if (connectedClients.chefs.has(socket)) {
        connectedClients.chefs.delete(socket);
        logger.info(`👨‍🍳 Chef disconnected`);
      }
      
      if (connectedClients.owners.has(socket)) {
        connectedClients.owners.delete(socket);
        logger.info(`👔 Owner disconnected`);
      }
    });

    // ========================================================================
    // ERROR HANDLING
    // ========================================================================

    socket.on('error', (error) => {
      logger.error(`❌ Socket error on ${socket.id}:`, error);
    });
  });

  // Log initial setup
  logger.success('✅ Socket.io handlers initialized');
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get connected clients count
 * @returns {object} Count by role
 */
const getConnectedClientsCount = () => {
  return {
    students: connectedClients.students.size,
    chefs: connectedClients.chefs.size,
    owners: connectedClients.owners.size,
    total: connectedClients.students.size + 
           connectedClients.chefs.size + 
           connectedClients.owners.size
  };
};

/**
 * Broadcast to all connected clients
 * @param {object} io - Socket.io instance
 * @param {string} event - Event name
 * @param {object} data - Data to broadcast
 */
const broadcastToAll = (io, event, data) => {
  io.emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });
  logger.info(`📢 Broadcasted ${event} to all clients`);
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = setupSocketHandlers;
module.exports.getConnectedClientsCount = getConnectedClientsCount;
module.exports.broadcastToAll = broadcastToAll;