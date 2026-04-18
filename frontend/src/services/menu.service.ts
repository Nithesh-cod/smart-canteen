import api from './api';
import { MenuItem, ApiResponse, PaginatedResponse } from '../types';

/**
 * Fetch all menu items (admin/owner view — includes unavailable items).
 */
export const getAll = async (): Promise<ApiResponse<MenuItem[]>> => {
  const response = await api.get<ApiResponse<MenuItem[]>>('/menu');
  return response.data;
};

/**
 * Fetch only available menu items (student-facing kiosk).
 */
export const getAvailable = async (): Promise<ApiResponse<MenuItem[]>> => {
  const response = await api.get<ApiResponse<MenuItem[]>>('/menu/available');
  return response.data;
};

/**
 * Fetch menu items filtered by category.
 */
export const getByCategory = async (
  category: string
): Promise<ApiResponse<MenuItem[]>> => {
  const response = await api.get<ApiResponse<MenuItem[]>>(
    `/menu/category/${encodeURIComponent(category)}`
  );
  return response.data;
};

/**
 * Search menu items by a text query.
 */
export const search = async (query: string): Promise<ApiResponse<MenuItem[]>> => {
  const response = await api.get<ApiResponse<MenuItem[]>>('/menu/search', {
    params: { q: query },
  });
  return response.data;
};

/**
 * Fetch a single menu item by its ID.
 */
export const getById = async (id: number): Promise<ApiResponse<MenuItem>> => {
  const response = await api.get<ApiResponse<MenuItem>>(`/menu/${id}`);
  return response.data;
};

/**
 * Toggle the availability of a menu item (chef role).
 */
export const toggleAvailability = async (
  id: number
): Promise<ApiResponse<MenuItem>> => {
  const response = await api.patch<ApiResponse<MenuItem>>(
    `/menu/${id}/availability`
  );
  return response.data;
};

/**
 * Create a new menu item (admin role).
 */
export const create = async (
  data: Partial<MenuItem>
): Promise<ApiResponse<MenuItem>> => {
  const response = await api.post<ApiResponse<MenuItem>>('/menu', data);
  return response.data;
};

/**
 * Update an existing menu item (admin role).
 */
export const update = async (
  id: number,
  data: Partial<MenuItem>
): Promise<ApiResponse<MenuItem>> => {
  const response = await api.put<ApiResponse<MenuItem>>(`/menu/${id}`, data);
  return response.data;
};

/**
 * Delete a menu item (admin role).
 */
export const deleteItem = async (id: number): Promise<ApiResponse<null>> => {
  const response = await api.delete<ApiResponse<null>>(`/menu/${id}`);
  return response.data;
};

// Re-export paginated variant type for convenience
export type { PaginatedResponse };
