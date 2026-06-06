import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../utils/constants';

class SocketService {
  private socket: Socket | null = null;

  /**
   * Connect to the socket server. Reuses existing connection if already connected.
   */
  connect(): Socket {
    if (!this.socket) {
      this.socket = io(SOCKET_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling'],
      });
    }
    return this.socket;
  }

  /**
   * Disconnect and destroy the socket instance.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Register an event listener.
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.socket?.on(event, callback);
  }

  /**
   * Remove an event listener.
   */
  off(event: string, callback?: (...args: any[]) => void): void {
    this.socket?.off(event, callback);
  }

  /**
   * Emit an event with optional payload.
   */
  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  /**
   * Whether the socket is currently connected.
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ─── Role-based room joins ─────────────────────────────────────────────────

  /**
   * Join the student-specific room to receive order updates.
   *
   * The server handler takes the raw id string and joins `student:${id}`.
   * Emitting an object here ({ studentId }) used to produce a room name of
   * `student:[object Object]`, dropping every targeted event.
   */
  joinAsStudent(studentId: string): void {
    this.emit('student:join', studentId);
  }

  /**
   * Subscribe to events for a specific order (used by the public OrderTracking
   * page and by guest checkouts which have no student room to join).
   */
  joinOrderRoom(orderId: number | string): void {
    this.emit('order:join', orderId);
  }

  /**
   * Join the chef room to receive new order notifications.
   */
  joinAsChef(): void {
    this.emit('chef:join', {});
  }

  /**
   * Join the owner room to receive analytics and management events.
   */
  joinAsOwner(): void {
    this.emit('owner:join', {});
  }
}

export const socketService = new SocketService();
export default socketService;
