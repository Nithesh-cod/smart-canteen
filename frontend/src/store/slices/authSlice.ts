import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Student, AuthState } from '../../types';

// Hydrate from localStorage on app init
const storedToken = localStorage.getItem('canteen_token');
const storedStudentRaw = localStorage.getItem('canteen_student');
let storedStudent: Student | null = null;
try {
  if (storedStudentRaw) {
    storedStudent = JSON.parse(storedStudentRaw) as Student;
  }
} catch {
  storedStudent = null;
}

const initialState: AuthState = {
  currentStudent: storedStudent,
  isAuthenticated: !!(storedToken && storedStudent),
  token: storedToken,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(
      state,
      action: PayloadAction<{ student: Student; token: string }>
    ) {
      state.currentStudent = action.payload.student;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.error = null;
      state.loading = false;
    },

    logout(state) {
      state.currentStudent = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      state.loading = false;
    },

    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },

    updateStudent(state, action: PayloadAction<Partial<Student>>) {
      if (state.currentStudent) {
        state.currentStudent = { ...state.currentStudent, ...action.payload };
        // Keep localStorage in sync
        localStorage.setItem(
          'canteen_student',
          JSON.stringify(state.currentStudent)
        );
      }
    },
  },
});

export const { setCredentials, logout, setLoading, setError, updateStudent } =
  authSlice.actions;
export default authSlice.reducer;
