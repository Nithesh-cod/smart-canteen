import api from './api';
import { Order, OrderStatus, ApiResponse, PaginatedResponse } from '../types';

export interface CreateOrderItem {
  menu_item_id: number;
  quantity: number;
}

export interface GetAllParams {
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Place a new order.
 */
export const create = async (
  items: CreateOrderItem[],
  pointsToRedeem: number = 0
): Promise<ApiResponse<Order>> => {
  const response = await api.post<ApiResponse<Order>>('/orders', {
    items,
    points_to_redeem: pointsToRedeem,
  });
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
  id: number,
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
