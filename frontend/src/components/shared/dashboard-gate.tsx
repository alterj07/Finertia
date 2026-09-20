"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, runOrchestrator } from "@/lib/api";
import { useAgentStatus } from "@/lib/use-agent-status";

interface NeedsRun {
  needs_run?: boolean;
  run_request?: string;
}

/** Wraps a dashboard screen: skeleton while loading, error card on failure,
 * "Run agents" call-to-action when the backend reports needs_run. */
export function DashboardGate<T extends NeedsRun>({
  loading,
  error,
  data,
  onRan,
  children,
}: {
  loading: boolean;
  error: string | null;
  data: T | null;
  onRan: () => void;
  children: (data: T) => ReactNode;
}) {
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const { status, refresh } = useAgentStatus(onRan);

  async function handleRun(request: string) {
    setRunning(true);
    setRunError(null);
    try {
      await runOrchestrator(request);
      onRan();
      refresh();
    } catch (err) {
      setRunError(
        err instanceof ApiError && err.status === 409
          ? "Agents are already running"
          : err instanceof Error
            ? err.message
            : "run failed",
      );
      setRunning(false);
      refresh();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 border border-rule bg-paper-raised px-4 py-8 text-sm text-ink-soft">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red/40 bg-paper-raised px-4 py-3 text-sm text-red">
        {error}
      </div>
    );
  }
  if (!data) return null;
  return (
    <div>
      {data.needs_run && status?.state === "running" && (
        <div className="mb-3 flex items-center gap-2 border border-rule bg-paper-raised px-3 py-2">
          <Loader2 size={12} className="animate-spin text-ink-soft" aria-hidden />
          <span className="text-xs text-ink-soft">
            Agents are analysing the data — this screen fills in automatically
            when they finish.
          </span>
        </div>
      )}
      {data.needs_run && status?.state !== "running" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border border-rule bg-paper-raised px-3 py-2">
          <span className="text-xs text-ink-soft">
            {status?.state === "failed"
              ? `Automatic agent run failed: ${status.error ?? "unknown error"}`
              : "No agent findings yet — run the agents to populate this screen."}
          </span>
          <button
            type="button"
            disabled={running}
            onClick={() => handleRun(data.run_request ?? "Close the books for Q1")}
            className="inline-flex items-center gap-1.5 rounded-chip border border-green bg-green px-2.5 py-1 text-xs text-paper hover:bg-green/85 disabled:opacity-50"
          >
            {running ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : null}
            {running ? "Running agents…" : "Run agents"}
          </button>
          {runError && <span className="text-xs text-red">{runError}</span>}
        </div>
      )}
      {children(data)}
    </div>
  );
}
