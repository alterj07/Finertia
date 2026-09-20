"use client";

import { create } from "zustand";

export const ENTITIES = ["Lumen Robotics"];
export const PERIODS = ["FY26 · Q1"];

interface AppState {
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
  entity: ENTITIES[0],
  setEntity: (entity) => set({ entity }),

  period: PERIODS[0],
  setPeriod: (period) => set({ period }),

  leftRailOpen: false,
  copilotOpen: false,
  setLeftRailOpen: (open) => set({ leftRailOpen: open }),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
}));
