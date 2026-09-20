"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Play } from "lucide-react";
import { listAgents, runAgent, type AgentSpec } from "@/lib/api";

type RunState =
  | { status: "idle" }
  | { status: "running"; agent: string }
  | { status: "done"; agent: string }
  | { status: "error"; agent: string; message: string };

/** Never resolves in under `ms` — so a run that finishes on this small demo
 * dataset in 40ms still gives the user a moment to actually see it happen. */
function withMinDuration<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.all([promise, new Promise((r) => setTimeout(r, ms))]).then(([result]) => result);
}

/** One button per registered backend agent. Running one writes its findings to
 * shared memory; the parent reloads the graph so they show up immediately. */
export function AgentRunner({ onRan }: { onRan: (agent: string) => void }) {
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [state, setState] = useState<RunState>({ status: "idle" });
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  async function handleRun(name: string) {
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    setState({ status: "running", agent: name });
    try {
      await withMinDuration(runAgent(name), 700);
      setState({ status: "done", agent: name });
      doneTimerRef.current = setTimeout(() => setState({ status: "idle" }), 1800);
      onRan(name);
    } catch (err) {
      setState({
        status: "error",
        agent: name,
        message: err instanceof Error ? err.message : "run failed",
      });
    }
  }

  if (agents.length === 0) return null;
  const running = state.status === "running";

  return (
    <div className="flex h-full flex-col border border-rule bg-paper-raised px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-soft">Run agent</span>
        <span className="text-xs text-ink-soft" role="status" aria-live="polite">
          {state.status === "running" && `Running ${state.agent}…`}
          {state.status === "error" && `${state.agent} failed: ${state.message}`}
        </span>
      </div>
      <div className="mt-2 flex flex-1 flex-wrap items-center gap-2">
        {agents.map((a) => {
          const isThis = state.status !== "idle" && state.agent === a.name;
          const isDone = state.status === "done" && isThis;
          return (
            <button
              key={a.name}
              type="button"
              title={a.description}
              disabled={running}
              onClick={() => handleRun(a.name)}
              className="inline-flex items-center gap-1.5 rounded-chip border border-rule px-2.5 py-1 text-xs text-ink transition-colors hover:border-ink-soft hover:bg-paper disabled:opacity-50"
            >
              {running && isThis ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : isDone ? (
                <Check size={12} className="text-green" aria-hidden />
              ) : (
                <Play size={12} aria-hidden />
              )}
              {a.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
