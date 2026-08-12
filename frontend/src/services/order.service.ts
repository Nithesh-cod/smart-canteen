import api from './api';
import { Order, OrderStatus, ApiResponse, PaginatedResponse } from '../types';

export interface CreateOrderItem {
  menu_item_id: number;
  quantity: number;
}

export interface GuestInfo {
  guest_name: string;
  guest_phone?: string;
  guest_roll?: string;
}

export interface GetAllParams {
  status?: string;
  page?: number;
  limit?: number;
  /**
   * ISO date string. Returns orders created at or after it, across ALL
   * statuses — the chef panel needs this for its "Today's Log" tab, whose
   * completed-order list and revenue total are otherwise filtered out by the
   * server's default kitchen-queue view.
   */
  from_date?: string;
}

/**
 * Place a new order.
 * Pass guestInfo when the student is not logged in (guest checkout).
 *
 * IMPORTANT — guest orders skip the auth interceptor entirely so that a
 * stale admin token in localStorage (from the owner panel open in another
 * tab) can never accidentally attach itself and make the order appear as if
 * the admin placed it.  The backend's optionalAuth middleware correctly
 * treats requests with no Authorization header as guest/anonymous.
 */
export const create = async (
  items: CreateOrderItem[],
  pointsToRedeem: number = 0,
  guestInfo?: GuestInfo
): Promise<ApiResponse<Order>> => {
  const isGuest = !!guestInfo;
  const response = await api.post<ApiResponse<Order>>(
    '/orders',
    {
      items,
      points_to_redeem: pointsToRedeem,
      ...(guestInfo ?? {}),
    },
    // skipAuth tells the request interceptor NOT to attach any JWT —
    // anonymous kiosk orders must never be associated with an admin account.
    isGuest ? ({ skipAuth: true } as any) : undefined
  );
  return response.data;
};

/**
 * Fetch a single order by its numeric ID.
 */
export const getById = async (id: number): Promise<ApiResponse<Order>> => {
  const response = await api.get<ApiResponse<Order>>(`/orders/${id}`);
  return response.data;
};

/**
 * Fetch all orders with optional filtering and pagination.
 */
export const getAll = async (
  params?: GetAllParams
): Promise<PaginatedResponse<Order>> => {
  const response = await api.get<PaginatedResponse<Order>>('/orders', { params });
  return response.data;
};

/**
 * Track an order by its human-readable order number (e.g. "ORD-0001").
 */
export const track = async (orderNumber: string): Promise<ApiResponse<Order>> => {
  const response = await api.get<ApiResponse<Order>>(
    `/orders/track/${encodeURIComponent(orderNumber)}`
  );
  return response.data;
};

/**
 * Update the status of an order (chef/owner role).
 */
export const updateStatus = async (
  id: string,
  status: OrderStatus
): Promise<ApiResponse<Order>> => {
  const response = await api.patch<ApiResponse<Order>>(`/orders/${id}/status`, {
    status,
  });
  return response.data;
};

/**
 * Cancel an order by its ID.
 */
export const cancel = async (id: number): Promise<ApiResponse<Order>> => {
  const response = await api.post<ApiResponse<Order>>(`/orders/${id}/cancel`);
  return response.data;
};
