"use client";

import { create } from "zustand";

interface AppState {
  leftRailOpen: boolean;
  copilotOpen: boolean;
  setLeftRailOpen: (open: boolean) => void;
  setCopilotOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  leftRailOpen: false,
  copilotOpen: false,
  setLeftRailOpen: (open) => set({ leftRailOpen: open }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
}));
