"use client";

import { useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { listAgents, runAgent, type AgentSpec } from "@/lib/api";

type RunState =
  | { status: "idle" }
  | { status: "running"; agent: string }
  | { status: "done"; agent: string; findings: number; note: string }
  | { status: "error"; agent: string; message: string };

/** One button per registered backend agent. Running one writes its findings to
 * shared memory; the parent reloads the graph so they show up immediately. */
export function AgentRunner({ onRan }: { onRan: (agent: string) => void }) {
  const [agents, setAgents] = useState<AgentSpec[]>([]);
  const [state, setState] = useState<RunState>({ status: "idle" });

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  async function handleRun(name: string) {
    setState({ status: "running", agent: name });
    try {
      const result = await runAgent(name);
      const s = result.summary as Record<string, unknown>;
      const note =
        typeof s.open_ar_total === "number"
          ? `open AR ${(s.open_ar_total as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          : typeof s.difference === "number"
            ? `bank vs book difference ${(s.difference as number).toFixed(2)}`
            : "";
      setState({ status: "done", agent: name, findings: result.findings.length, note });
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
    <div className="mb-3 flex flex-wrap items-center gap-2 border border-rule bg-paper-raised px-3 py-2">
      <span className="font-mono text-2xs uppercase tracking-wide text-ink-soft">Run agent</span>
      {agents.map((a) => {
        const isThis = state.status !== "idle" && state.agent === a.name;
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
            ) : (
              <Play size={12} aria-hidden />
            )}
            {a.name}
          </button>
        );
      })}
      <span className="ml-auto text-xs text-ink-soft" role="status" aria-live="polite">
        {state.status === "running" && `Running ${state.agent}…`}
        {state.status === "done" &&
          `${state.agent}: ${state.findings} findings in memory${state.note ? ` · ${state.note}` : ""}`}
        {state.status === "error" && `${state.agent} failed: ${state.message}`}
      </span>
    </div>
  );
}
