import { CartItem } from '../types';
import { TIER_COLORS, POINTS_PER_RUPEE, POINTS_VALUE, MAX_POINTS_DISCOUNT_PERCENT } from './constants';

/**
 * Format a number as Indian Rupee price string.
 * e.g. 120 => "₹120"
 */
export const formatPrice = (amount: number): string => {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

/**
 * Calculate the total price of all items in the cart.
 */
export const calculateCartTotal = (items: CartItem[]): number => {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
};

/**
 * Calculate the number of loyalty points earned for a given order amount.
 * 10% of the amount, rounded to the nearest integer.
 */
export const calculatePointsEarned = (amount: number): number => {
  return Math.round(amount * POINTS_PER_RUPEE);
};

/**
 * Calculate the maximum discount obtainable by redeeming loyalty points.
 * Cannot exceed 50% of the order total.
 * pointsDiscount = points * POINTS_VALUE  (i.e. 1 point = ₹0.10)
 */
export const calculateMaxPointsDiscount = (amount: number, points: number): number => {
  const pointsDiscount = points * POINTS_VALUE;
  const maxAllowed = amount * (MAX_POINTS_DISCOUNT_PERCENT / 100);
  return Math.min(pointsDiscount, maxAllowed);
};

/**
 * Return the hex colour associated with a loyalty tier.
 */
export const getTierColor = (tier: string): string => {
  return (TIER_COLORS as Record<string, string>)[tier] ?? '#c0c0c0';
};

/**
 * Return an emoji badge for a loyalty tier.
 */
export const getTierEmoji = (tier: string): string => {
  const map: Record<string, string> = {
    Bronze: '🥉',
    Silver: '🥈',
    Gold: '🥇',
    Platinum: '💎',
  };
  return map[tier] ?? '🥉';
};

/**
 * Return a neon hex colour for an order status.
 */
export const getStatusColor = (status: string): string => {
  const map: Record<string, string> = {
    pending: '#ffed4e',
    preparing: '#ff9500',
    ready: '#00ff88',
    completed: '#00f5ff',
    cancelled: '#ff3366',
  };
  return map[status] ?? '#c0c0c0';
};

/**
 * Return a human-friendly label for an order status.
 */
export const getStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    pending: 'Pending',
    preparing: 'Preparing',
    ready: 'Ready for Pickup',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] ?? status;
};

/**
 * Return a relative time string, e.g. "2 mins ago", "1 hour ago".
 */
export const getTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-IN');
};

/**
 * Generate initials from a full name.
 * e.g. "Ram Kumar" => "RK", "Alice" => "AL"
 */
export const generateInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
};

/**
 * Validate an Indian mobile phone number.
 * Accepts optional +91 / 0 prefix, then 10 digits starting with 6-9.
 */
export const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s+/g, '');
  return /^(?:\+91|0)?[6-9]\d{9}$/.test(cleaned);
};

/**
 * Validate a roll number — must be a non-empty string.
 */
export const validateRoll = (roll: string): boolean => {
  return typeof roll === 'string' && roll.trim().length > 0;
};
