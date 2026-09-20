"use client";

import { create } from "zustand";
import { ApiError, sendChat } from "@/lib/api";
import { COPILOT_SCRIPTS } from "@/lib/mock/copilot";
import type { CopilotMessage, ModuleKey } from "@/lib/types";

interface CopilotState {
  activeModule: ModuleKey;
  visited: Partial<Record<ModuleKey, boolean>>;
  messages: Partial<Record<ModuleKey, CopilotMessage[]>>;
  sessionIds: Partial<Record<ModuleKey, string>>;
  pending: boolean;
  error: string | null;
  pendingDraft: string | null;
  setActiveModule: (module: ModuleKey) => void;
  sendMessage: (module: ModuleKey, text: string) => Promise<void>;
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
  sessionIds: {},
  pending: false,
  error: null,
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

  sendMessage: async (module, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMessage: CopilotMessage = {
      id: nextId("user"),
      role: "user",
      text: trimmed,
    };
    set((s) => ({
      pending: true,
      error: null,
      messages: {
        ...s.messages,
        [module]: [...(s.messages[module] ?? []), userMessage],
      },
    }));

    try {
      const resp = await sendChat(
        get().sessionIds[module] ?? null,
        trimmed,
        `Module: ${module}`,
      );
      const reply: CopilotMessage = {
        id: nextId("agent"),
        role: "agent",
        text: resp.message.content ?? "",
        citations: resp.citations.map((id) => ({
          label: id,
          href: `/graph?node=${encodeURIComponent(id)}`,
        })),
      };
      set((s) => ({
        sessionIds: { ...s.sessionIds, [module]: resp.session_id },
        messages: {
          ...s.messages,
          [module]: [...(s.messages[module] ?? []), reply],
        },
      }));
    } catch (e) {
      const detail =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      set((s) => ({
        error: detail,
        messages: {
          ...s.messages,
          [module]: [
            ...(s.messages[module] ?? []),
            {
              id: nextId("agent"),
              role: "agent",
              text: `Couldn't reach the Finertia backend: ${detail}`,
            },
          ],
        },
      }));
    } finally {
      set({ pending: false });
    }
  },

  getMessages: (module) => get().messages[module] ?? [],

  setPendingDraft: (text) => set({ pendingDraft: text }),
  clearPendingDraft: () => set({ pendingDraft: null }),
}));
