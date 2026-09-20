"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ApiError, deleteChatSession, sendChat } from "@/lib/api";
import { COPILOT_SCRIPTS } from "@/lib/config/copilot";
import { useHighlightStore } from "@/store/highlight-store";
import type { CopilotMessage, ModuleKey } from "@/lib/types";

interface CopilotState {
  activeModule: ModuleKey;
  messages: CopilotMessage[];
  sessionId: string | null;
  opened: boolean;
  pending: boolean;
  error: string | null;
  pendingDraft: string | null;
  setActiveModule: (module: ModuleKey) => void;
  sendMessage: (text: string) => Promise<void>;
  resetConversation: () => void;
  setPendingDraft: (text: string) => void;
  clearPendingDraft: () => void;
}

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function opener(): CopilotMessage {
  const script = COPILOT_SCRIPTS["command-center"];
  return {
    id: nextId("agent"),
    role: "agent",
    text: script.opening,
    citations: script.openingCitations,
  };
}

/** persist writes localStorage on every set — hydrate first so a set that
 * lands before the rail's rehydrate() can't clobber the saved thread. */
function ensureHydrated() {
  if (typeof window !== "undefined" && !useCopilotStore.persist.hasHydrated()) {
    useCopilotStore.persist.rehydrate();
  }
}

export const useCopilotStore = create<CopilotState>()(
  persist(
    (set, get) => ({
      activeModule: "command-center",
      messages: [],
      sessionId: null,
      opened: false,
      pending: false,
      error: null,
      pendingDraft: null,

      setActiveModule: (module) => {
        ensureHydrated();
        set((s) => {
          if (!s.opened && s.messages.length === 0) {
            return { activeModule: module, opened: true, messages: [opener()] };
          }
          return { activeModule: module, opened: true };
        });
      },

      sendMessage: async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        ensureHydrated();
        const moduleKey = get().activeModule;
        const userMessage: CopilotMessage = {
          id: nextId("user"),
          role: "user",
          text: trimmed,
        };
        set((s) => ({
          pending: true,
          error: null,
          messages: [...s.messages, userMessage],
        }));

        try {
          const resp = await sendChat(
            get().sessionId,
            trimmed,
            `Module: ${moduleKey}`,
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
            sessionId: resp.session_id,
            messages: [...s.messages, reply],
          }));
          useHighlightStore.getState().pulse(resp.citations);
        } catch (e) {
          const detail =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e);
          set((s) => ({
            error: detail,
            messages: [
              ...s.messages,
              {
                id: nextId("agent"),
                role: "agent",
                text: `Couldn't reach the Finertia backend: ${detail}`,
              },
            ],
          }));
        } finally {
          set({ pending: false });
        }
      },

      resetConversation: () => {
        ensureHydrated();
        const old = get().sessionId;
        if (old) {
          deleteChatSession(old).catch(() => undefined);
        }
        set({
          messages: [opener()],
          sessionId: null,
          opened: true,
          error: null,
        });
      },

      setPendingDraft: (text) => set({ pendingDraft: text }),
      clearPendingDraft: () => set({ pendingDraft: null }),
    }),
    {
      name: "finertia-copilot",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        messages: s.messages,
        sessionId: s.sessionId,
        opened: s.opened,
      }),
      // v1 seeded a longer opening line that's since changed; drop any
      // persisted thread that still starts with it so it regenerates fresh.
      migrate: (persisted, version) => {
        const state = persisted as Partial<CopilotState>;
        if (version < 2 && state.messages?.[0]?.role === "agent") {
          return { ...state, messages: [], opened: false } as CopilotState;
        }
        return state as CopilotState;
      },
      skipHydration: true,
    },
  ),
);
