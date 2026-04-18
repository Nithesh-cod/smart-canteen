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

    // ========================================================================
    // ORDER EVENTS
    // ========================================================================

    /**
     * Broadcast new order to kitchen
     * @event order:created
     * @param {object} order - Order data
     */
    socket.on('order:created', (order) => {
      logger.info(`📦 New order created: #${order.order_number}`);
      
      // Notify kitchen (chef display)
      io.to('kitchen').emit('order:new', {
        ...order,
        timestamp: new Date().toISOString(),
        notification: {
          title: 'New Order!',
          message: `Order #${order.order_number} - ${order.items.length} items`,
          sound: true
        }
      });
      
      // Notify owner dashboard
      io.to('admin').emit('order:new', order);
      
      logger.success(`✅ Order #${order.order_number} broadcasted to kitchen`);
    });

    /**
     * Order status updated
     * @event order:status-updated
     * @param {object} data - { orderId, status, studentId }
     */
    socket.on('order:status-updated', (data) => {
      const { orderId, orderNumber, status, studentId } = data;
      logger.info(`🔄 Order #${orderNumber} status: ${status}`);
      
      // Notify specific student
      if (studentId) {
        io.to(`student:${studentId}`).emit('order:status-change', {
          orderId,
          orderNumber,
          status,
          message: getStatusMessage(status),
          timestamp: new Date().toISOString()
        });
      }
      
      // Notify kitchen and admin
      io.to('kitchen').emit('order:updated', data);
      io.to('admin').emit('order:updated', data);
      
      logger.success(`✅ Order #${orderNumber} status update sent`);
    });

    /**
     * Order cancelled
     * @event order:cancelled
     * @param {object} data - { orderId, orderNumber, studentId, reason }
     */
    socket.on('order:cancelled', (data) => {
      const { orderId, orderNumber, studentId, reason } = data;
      logger.warn(`❌ Order #${orderNumber} cancelled: ${reason}`);
      
      // Notify student
      if (studentId) {
        io.to(`student:${studentId}`).emit('order:cancelled', {
          orderId,
          orderNumber,
          reason,
          message: 'Your order has been cancelled',
          timestamp: new Date().toISOString()
        });
      }
      
      // Notify kitchen and admin
      io.to('kitchen').emit('order:cancelled', data);
      io.to('admin').emit('order:cancelled', data);
    });

    // ========================================================================
    // MENU EVENTS
    // ========================================================================

    /**
     * Menu item availability changed
     * @event menu:availability-changed
     * @param {object} data - { itemId, itemName, isAvailable }
     */
    socket.on('menu:availability-changed', (data) => {
      const { itemId, itemName, isAvailable } = data;
      logger.info(`🍽️ Menu item ${itemName}: ${isAvailable ? 'Available' : 'Unavailable'}`);
      
      // Broadcast to all connected students
      io.emit('menu:item-updated', {
        itemId,
        itemName,
        isAvailable,
        message: `${itemName} is now ${isAvailable ? 'available' : 'unavailable'}`,
        timestamp: new Date().toISOString()
      });
    });

    // ========================================================================
    // PAYMENT EVENTS
    // ========================================================================

    /**
     * Payment successful - trigger bill print
     * @event payment:success
     * @param {object} data - { orderId, studentId, amount }
     */
    socket.on('payment:success', (data) => {
      const { orderId, studentId, amount } = data;
      logger.success(`💳 Payment successful: Order #${orderId} - ₹${amount}`);
      
      // Notify student
      if (studentId) {
        io.to(`student:${studentId}`).emit('payment:confirmed', {
          orderId,
          amount,
          message: 'Payment successful! Your order is being prepared.',
          timestamp: new Date().toISOString()
        });
      }
    });

    // ========================================================================
    // ADMIN EVENTS
    // ========================================================================

    /**
     * Admin requests real-time stats update
     * @event admin:request-stats
     */
    socket.on('admin:request-stats', () => {
      // This would typically fetch latest stats and send back
      // For now, just acknowledge
      socket.emit('admin:stats-requested', {
        message: 'Stats update requested',
        timestamp: new Date().toISOString()
      });
    });

    // ========================================================================
    // TYPING INDICATORS (Optional - for chef notes)
    // ========================================================================

    /**
     * Chef is typing a note
     * @event chef:typing
     * @param {object} data - { orderId }
     */
    socket.on('chef:typing', (data) => {
      socket.to('admin').emit('chef:typing', data);
    });

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
 * Get user-friendly status message
 * @param {string} status - Order status
 * @returns {string} User-friendly message
 */
const getStatusMessage = (status) => {
  const messages = {
    pending: 'Your order has been received',
    preparing: 'Your order is being prepared',
    ready: 'Your order is ready for pickup!',
    completed: 'Order completed. Thank you!',
    cancelled: 'Your order has been cancelled'
  };
  
  return messages[status] || 'Order status updated';
};

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