import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import {
  setCredentials,
  logout as logoutAction,
  setLoading,
  setError,
} from '../store/slices/authSlice';
import * as authService from '../services/auth.service';
import { SignupData } from '../services/auth.service';

export const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { currentStudent, isAuthenticated, token, loading, error } = useSelector(
    (state: RootState) => state.auth
  );

  /**
   * Log in using a roll number or phone number identifier.
   */
  const login = async (identifier: string): Promise<boolean> => {
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const response = await authService.login(identifier);
      if (response.success && response.data) {
        const { token: authToken, student } = response.data;
        authService.saveAuthData(authToken, student);
        dispatch(setCredentials({ student, token: authToken }));
        return true;
      } else {
        dispatch(setError(response.error ?? response.message ?? 'Login failed.'));
        return false;
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        err?.message ??
        'Login failed. Please try again.';
      dispatch(setError(message));
      return false;
    }
  };

  /**
   * Register a new student account.
   */
  const signup = async (data: SignupData): Promise<boolean> => {
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const response = await authService.signup(data);
      if (response.success && response.data) {
        const { token: authToken, student } = response.data;
        authService.saveAuthData(authToken, student);
        dispatch(setCredentials({ student, token: authToken }));
        return true;
      } else {
        dispatch(setError(response.error ?? response.message ?? 'Signup failed.'));
        return false;
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        err?.message ??
        'Signup failed. Please try again.';
      dispatch(setError(message));
      return false;
    }
  };

  /**
   * Log out the current student — clears server session and local state.
   */
  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      authService.clearAuthData();
      dispatch(logoutAction());
    }
  };

  /**
   * Clear any existing auth error.
   */
  const clearError = () => {
    dispatch(setError(null));
  };

  return {
    currentStudent,
    isAuthenticated,
    token,
    loading,
    error,
    login,
    signup,
    logout,
    clearError,
  };
};
