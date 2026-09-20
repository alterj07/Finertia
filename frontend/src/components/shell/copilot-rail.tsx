"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COPILOT_SCRIPTS } from "@/lib/config/copilot";
import { useAppStore } from "@/store/app-store";
import { useCopilotStore } from "@/store/copilot-store";
import type { CopilotMessage } from "@/lib/types";

const EMPTY_MESSAGES: CopilotMessage[] = [];

export function CopilotRail() {
  const copilotOpen = useAppStore((s) => s.copilotOpen);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);
  const activeModule = useCopilotStore((s) => s.activeModule);
  const messages = useCopilotStore((s) => s.messages[s.activeModule] ?? EMPTY_MESSAGES);
  const sendMessage = useCopilotStore((s) => s.sendMessage);
  const pending = useCopilotStore((s) => s.pending);
  const pendingDraft = useCopilotStore((s) => s.pendingDraft);
  const clearPendingDraft = useCopilotStore((s) => s.clearPendingDraft);

  const [input, setInput] = useState("");
  const [consumedDraft, setConsumedDraft] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const script = COPILOT_SCRIPTS[activeModule];

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Adjust the input from a pending draft during render (React's documented
  // pattern for syncing local state from external state), then handle the
  // one-time side effects — clearing the draft and focusing — in an effect.
  if (pendingDraft !== null && pendingDraft !== consumedDraft) {
    setConsumedDraft(pendingDraft);
    setInput(pendingDraft);
  }

  useEffect(() => {
    if (consumedDraft !== null) {
      clearPendingDraft();
      inputRef.current?.focus();
    }
  }, [consumedDraft, clearPendingDraft]);

  function submit(text: string) {
    if (!text.trim() || pending) return;
    sendMessage(activeModule, text);
    setInput("");
  }

  const content = (
    <div className="flex h-full flex-col bg-paper-raised">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-rule px-4 py-4">
        <div>
          <div className="font-serif text-[15px] text-ink">Ask Finertia</div>
          <div className="mt-0.5 text-xs text-ink-soft">Context-aware to whatever screen you&rsquo;re on</div>
        </div>
        <button
          type="button"
          onClick={() => setCopilotOpen(false)}
          className="text-ink-soft hover:text-ink min-[880px]:hidden"
          aria-label="Close Ask Finertia"
        >
          <X size={16} />
        </button>
      </div>

      <div ref={logRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {messages.map((m) =>
            m.role === "agent" ? (
              <div key={m.id} className="max-w-[70ch]">
                <div className="mb-1 font-mono text-2xs tracking-wide text-ink-soft">FINERTIA</div>
                <p className="text-sm leading-relaxed text-ink">{m.text}</p>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-start gap-1">
                    {m.citations.map((c) => (
                      <Link
                        key={c.href + c.label}
                        href={c.href}
                        className="rounded border border-rule bg-paper px-1.5 py-0.5 font-mono text-2xs text-blue hover:border-blue"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-l-md rounded-tr-md rounded-br-2xl bg-ink px-3 py-2 text-sm text-paper shadow-[0_2px_8px_rgba(var(--shadow-color),0.18)]">
                  {m.text}
                </div>
              </div>
            ),
          )}
          {pending && (
            <div className="max-w-[70ch]">
              <div className="mb-1 font-mono text-2xs tracking-wide text-ink-soft">FINERTIA</div>
              <p className="text-sm text-ink-soft">Thinking…</p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-rule px-3 pt-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}>
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {script.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={pending}
              className="rounded-chip border border-rule px-2.5 py-1 text-xs text-ink-soft hover:border-ink-soft hover:text-ink disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about any number…"
            aria-label="Ask Finertia"
            disabled={pending}
            className="min-w-0 flex-1 rounded-chip border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-soft focus-visible:border-blue disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper hover:bg-ink/85 disabled:opacity-40"
            disabled={!input.trim() || pending}
          >
            <ArrowUp size={15} />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop only — the panel itself is a single instance repositioned by breakpoint below */}
      {copilotOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 min-[880px]:hidden" onClick={() => setCopilotOpen(false)} aria-hidden />
      )}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[86%] max-w-[380px] border-l border-rule transition-transform duration-200",
          "min-[880px]:static min-[880px]:z-auto min-[880px]:w-[340px] min-[880px]:max-w-none min-[880px]:shrink-0 min-[880px]:translate-x-0",
          copilotOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {content}
      </div>
    </>
  );
}
