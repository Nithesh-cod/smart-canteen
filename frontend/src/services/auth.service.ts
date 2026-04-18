import api from './api';
import { Student, ApiResponse } from '../types';

const TOKEN_KEY = 'canteen_token';
const STUDENT_KEY = 'canteen_student';

export interface SignupData {
  name: string;
  roll_number: string;
  phone: string;
  email?: string;
  department?: string;
}

export interface AuthResponseData {
  token: string;
  student: Student;
}

/**
 * Register a new student account.
 */
export const signup = async (
  data: SignupData
): Promise<ApiResponse<AuthResponseData>> => {
  const response = await api.post<ApiResponse<AuthResponseData>>('/auth/signup', data);
  return response.data;
};

/**
 * Log in using roll number or phone number.
 */
export const login = async (
  identifier: string
): Promise<ApiResponse<AuthResponseData>> => {
  const response = await api.post<ApiResponse<AuthResponseData>>('/auth/login', {
    identifier,
  });
  return response.data;
};

/**
 * Fetch the authenticated student's profile.
 */
export const getProfile = async (): Promise<ApiResponse<Student>> => {
  const response = await api.get<ApiResponse<Student>>('/auth/profile');
  return response.data;
};

/**
 * Log out the current session on the server.
 */
export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/logout');
  } catch {
    // Ignore server errors on logout — always clear local state
  }
};

/**
 * Persist auth data to localStorage.
 */
export const saveAuthData = (token: string, student: Student): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
};

/**
 * Remove auth data from localStorage.
 */
export const clearAuthData = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STUDENT_KEY);
};

/**
 * Read the stored JWT token.
 */
export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Read the stored student object.
 */
export const getStoredStudent = (): Student | null => {
  const raw = localStorage.getItem(STUDENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Student;
  } catch {
    return null;
  }
};
