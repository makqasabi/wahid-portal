import { create } from 'zustand';
import type { User } from '@/types';
import { authApi } from '@/api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setUser: (user: User) => void;
  setSession: (user: User, token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (email: string, password: string, totpCode?: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(email, password, totpCode);

      // If 2FA is required, throw a special marker for the login page
      if ((response as any).requires2FA) {
        set({ isLoading: false });
        const err = new Error('2FA_REQUIRED');
        (err as any).requires2FA = true;
        throw err;
      }

      // Access token in memory only — refresh token is in httpOnly cookie
      set({
        user: response.user,
        token: response.accessToken,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });
    }
  },

  refreshToken: async () => {
    try {
      const response = await authApi.refresh();
      set({ token: response.accessToken, isAuthenticated: true });
    } catch {
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  setUser: (user: User) => set({ user }),

  setSession: (user: User, token: string) =>
    set({ user, token, isAuthenticated: true, isLoading: false }),
}));
