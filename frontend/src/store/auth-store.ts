"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authLogin, authMe, authSignup, type AuthUser } from "@/lib/api";
import { clearToken, setToken } from "@/lib/auth-token";
import { useCopilotStore } from "@/store/copilot-store";

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string, name: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,

      login: async (identifier, password) => {
        const res = await authLogin(identifier, password);
        setToken(res.token);
        set({ user: res.user });
        return res.user;
      },

      signup: async (email, password, name) => {
        const res = await authSignup(email, password, name);
        setToken(res.token);
        set({ user: res.user });
        return res.user;
      },

      logout: () => {
        clearToken();
        set({ user: null });
        useCopilotStore.getState().resetConversation();
      },

      refresh: async () => {
        try {
          const user = await authMe();
          set({ user });
        } catch {
          clearToken();
          set({ user: null });
          useCopilotStore.getState().resetConversation();
        }
      },
    }),
    {
      name: "finertia-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user }),
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hydrated: true });
      },
    },
  ),
);
