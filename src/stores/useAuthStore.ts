import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../config/api';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string) => Promise<boolean>;
  fetchMe: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            set({ isLoading: false, error: data.detail ?? 'Invalid credentials' });
            return false;
          }

          const { access_token } = await res.json();
          set({ token: access_token });

          const meRes = await apiFetch('/auth/me', {}, access_token);
          if (meRes.ok) {
            const user = await meRes.json();
            set({ user, isAuthenticated: true, isLoading: false });
          } else {
            set({ isAuthenticated: true, isLoading: false });
          }
          return true;
        } catch (e: any) {
          set({ isLoading: false, error: 'Cannot reach server. Check API URL.' });
          return false;
        }
      },

      register: async (email, password, fullName) => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, full_name: fullName }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            set({ isLoading: false, error: data.detail ?? 'Registration failed' });
            return false;
          }

          set({ isLoading: false });
          return true;
        } catch {
          set({ isLoading: false, error: 'Cannot reach server. Check API URL.' });
          return false;
        }
      },

      fetchMe: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const res = await apiFetch('/auth/me', {}, token);
          if (res.ok) {
            const user = await res.json();
            set({ user, isAuthenticated: true });
          } else {
            set({ token: null, user: null, isAuthenticated: false });
          }
        } catch {}
      },

      logout: () =>
        set({ user: null, token: null, isAuthenticated: false, error: null }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'pneumoscan-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
