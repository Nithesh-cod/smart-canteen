// In development, Vite proxies /api and /socket.io to localhost:5000.
// In production, the Express backend serves the frontend from the same origin,
// so relative paths resolve correctly without needing an absolute URL.
export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

export const ORDER_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 1000,
  GOLD: 3000,
  PLATINUM: 5000,
} as const;

export const TIER_COLORS = {
  Bronze: '#cd7f32',
  Silver: '#c0c0c0',
  Gold: '#ffd700',
  Platinum: '#e5e4e2',
} as const;

export const CATEGORIES = ['all', 'starters', 'mains', 'desserts', 'beverages'] as const;

export const POINTS_PER_RUPEE = 0.1;          // 10% of order value earned as points
export const POINTS_VALUE = 0.1;               // 1 point = ₹0.10
export const MAX_POINTS_DISCOUNT_PERCENT = 50; // max 50% of bill payable with points
export const MIN_POINTS_TO_REDEEM = 100;
