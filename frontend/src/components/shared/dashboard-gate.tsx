"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { runOrchestrator } from "@/lib/api";

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

  async function handleRun(request: string) {
    setRunning(true);
    setRunError(null);
    try {
      await runOrchestrator(request);
      onRan();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "run failed");
      setRunning(false);
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
      {data.needs_run && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border border-rule bg-paper-raised px-3 py-2">
          <span className="text-xs text-ink-soft">
            No agent findings yet — run the agents to populate this screen.
          </span>
          <button
            type="button"
            disabled={running}
            onClick={() => handleRun(data.run_request ?? "Close the books for Q1")}
            className="inline-flex items-center gap-1.5 rounded-chip border border-ink bg-ink px-2.5 py-1 text-xs text-paper hover:bg-ink/85 disabled:opacity-50"
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
