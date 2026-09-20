"use client";

import { create } from "zustand";

interface HighlightState {
  ids: Set<string>;
  /** Bumps on every pulse so listeners can re-trigger even with the same ids. */
  token: number;
  pulse: (ids: string[]) => void;
}

/** Broadcasts the row/node ids the chatbot just answered about, so any table
 * on screen can flash and scroll to the matching row — the tables stay live
 * to the conversation instead of sitting inert next to it. */
export const useHighlightStore = create<HighlightState>((set) => ({
  ids: new Set(),
  token: 0,
  pulse: (ids) => {
    if (ids.length === 0) return;
    set((s) => ({ ids: new Set(ids), token: s.token + 1 }));
  },
}));
