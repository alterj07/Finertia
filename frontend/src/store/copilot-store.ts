"use client";

import { create } from "zustand";
import { COPILOT_FALLBACK, COPILOT_SCRIPTS } from "@/lib/mock/copilot";
import type { CopilotMessage, ModuleKey } from "@/lib/types";

interface CopilotState {
  activeModule: ModuleKey;
  visited: Partial<Record<ModuleKey, boolean>>;
  messages: Partial<Record<ModuleKey, CopilotMessage[]>>;
  pendingDraft: string | null;
  setActiveModule: (module: ModuleKey) => void;
  sendMessage: (module: ModuleKey, text: string) => void;
  getMessages: (module: ModuleKey) => CopilotMessage[];
  setPendingDraft: (text: string) => void;
  clearPendingDraft: () => void;
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  activeModule: "command-center",
  visited: {},
  messages: {},
  pendingDraft: null,

  setActiveModule: (module) => {
    set((s) => {
      if (s.visited[module]) {
        return { activeModule: module };
      }
      const script = COPILOT_SCRIPTS[module];
      const opening: CopilotMessage = {
        id: nextId("agent"),
        role: "agent",
        text: script.opening,
        citations: script.openingCitations,
      };
      return {
        activeModule: module,
        visited: { ...s.visited, [module]: true },
        messages: {
          ...s.messages,
          [module]: [...(s.messages[module] ?? []), opening],
        },
      };
    });
  },

  sendMessage: (module, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMessage: CopilotMessage = { id: nextId("user"), role: "user", text: trimmed };
    set((s) => ({
      messages: {
        ...s.messages,
        [module]: [...(s.messages[module] ?? []), userMessage],
      },
    }));

    const script = COPILOT_SCRIPTS[module];
    const canned = script.answers[trimmed];
    const reply: CopilotMessage = canned
      ? { id: nextId("agent"), role: "agent", text: canned.text, citations: canned.citations }
      : { id: nextId("agent"), role: "agent", text: COPILOT_FALLBACK };

    // Simulate a brief agent thinking delay so the log doesn't feel like a static script.
    setTimeout(() => {
      set((s) => ({
        messages: {
          ...s.messages,
          [module]: [...(s.messages[module] ?? []), reply],
        },
      }));
    }, 260);
  },

  getMessages: (module) => get().messages[module] ?? [],

  setPendingDraft: (text) => set({ pendingDraft: text }),
  clearPendingDraft: () => set({ pendingDraft: null }),
}));
