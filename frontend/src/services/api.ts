import axios from 'axios';
import { API_URL } from '../utils/constants';

// ─── Numeric field normalizer ─────────────────────────────────────────────────
// PostgreSQL DECIMAL/NUMERIC columns arrive as strings from the `pg` driver.
// These field names should always be numbers — coerce them wherever they appear.
const NUMERIC_FIELDS = new Set([
  'price', 'rating', 'total_amount', 'original_amount', 'discount_amount',
  'discount_percentage', 'min_order_amount', 'total_revenue',
  'points', 'points_used', 'points_earned', 'total_spent',
  'preparation_time', 'lifetime_spent',
  // Revenue chart / aggregated report fields
  'revenue', 'order_count', 'amount',
]);

function normalizeNumbers(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(normalizeNumbers);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (NUMERIC_FIELDS.has(k) && v !== null && v !== undefined) {
        const n = Number(v);
        result[k] = isNaN(n) ? v : n;
      } else {
        result[k] = normalizeNumbers(v);
      }
    }
    return result;
  }
  return obj;
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Request interceptor: attach JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('canteen_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: normalise numeric strings + handle 401 Unauthorized
api.interceptors.response.use(
  (response) => {
    // Coerce known DECIMAL fields from strings → numbers globally
    if (response.data) {
      response.data = normalizeNumbers(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('canteen_token');
      localStorage.removeItem('canteen_student');
      // Fire a custom event so each page handles auth loss in its own way.
      // Do NOT use window.location.href = '/' — on admin/chef ports that
      // reloads the same page and causes an infinite 401 → reload → 401 loop.
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export default api;
