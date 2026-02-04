import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Exercitiu, Theme } from '@/types';
import api from '@/services/api';

interface AppStore {
  // Auth
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  
  // App state
  exercitiu: Exercitiu | null;
  theme: Theme;
  sidebarOpen: boolean;
  
  // Actions
  login: (codAcces: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  
  loadExercitiu: () => Promise<void>;
  setExercitiu: (exercitiu: Exercitiu | null) => void;
  
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Init
  init: () => Promise<void>;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      exercitiu: null,
      theme: 'light',
      sidebarOpen: true,

      // Auth actions
      login: async (codAcces: string) => {
        const response = await api.login(codAcces);
        set({
          user: response.user,
          token: response.access_token,
          isAuthenticated: true,
        });
        // Load exercitiu after login
        await get().loadExercitiu();
      },

      logout: () => {
        api.logout();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          exercitiu: null,
        });
      },

      setUser: (user) => set({ user }),

      // Exercitiu actions
      loadExercitiu: async () => {
        try {
          const exercitiu = await api.getExercitiuCurent();
          set({ exercitiu });
        } catch (error) {
          console.error('Failed to load exercitiu:', error);
        }
      },

      setExercitiu: (exercitiu) => set({ exercitiu }),

      // Theme
      setTheme: (theme) => {
        set({ theme });
        // Apply theme to document
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          // Auto - check system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.classList.toggle('dark', prefersDark);
        }
      },

      // Sidebar
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Init app
      init: async () => {
        const { token, theme } = get();
        
        // Apply theme
        get().setTheme(theme);
        
        // If we have a token, verify it
        if (token) {
          try {
            const user = await api.getMe();
            set({ user, isAuthenticated: true });
            await get().loadExercitiu();
          } catch {
            // Token invalid, logout
            get().logout();
          }
        }
      },
    }),
    {
      name: 'cheltuieli-storage',
      partialize: (state) => ({
        token: state.token,
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

// Role check helpers
export const useIsAdmin = () => {
  const user = useAppStore((state) => state.user);
  return user?.rol === 'admin';
};

export const useIsSef = () => {
  const user = useAppStore((state) => state.user);
  return user?.rol === 'admin' || user?.rol === 'sef';
};

export const useCanVerify = () => {
  return useIsSef();
};
