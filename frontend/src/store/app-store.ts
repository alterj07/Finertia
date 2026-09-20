"use client";

import { create } from "zustand";

export const ENTITIES = ["Lumen Robotics"];
export const PERIODS = ["FY26 · Q1"];

interface AppState {
  isDark: boolean;
  setDark: (dark: boolean) => void;
  toggleDark: () => void;

  entity: string;
  setEntity: (entity: string) => void;

  period: string;
  setPeriod: (period: string) => void;

  leftRailOpen: boolean;
  copilotOpen: boolean;
  setLeftRailOpen: (open: boolean) => void;
  setCopilotOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isDark: false,
  setDark: (dark) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      try {
        localStorage.setItem("finertia-theme", dark ? "dark" : "light");
      } catch {
        // ignore
      }
    }
    set({ isDark: dark });
  },
  toggleDark: () => set((s) => {
    const next = !s.isDark;
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
      try {
        localStorage.setItem("finertia-theme", next ? "dark" : "light");
      } catch {
        // ignore
      }
    }
    return { isDark: next };
  }),

  entity: ENTITIES[0],
  setEntity: (entity) => set({ entity }),

  period: PERIODS[0],
  setPeriod: (period) => set({ period }),

  leftRailOpen: false,
  copilotOpen: false,
  setLeftRailOpen: (open) => set({ leftRailOpen: open }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
}));
