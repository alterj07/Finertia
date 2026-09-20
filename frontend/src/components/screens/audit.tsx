"use client";

import { cn } from "@/lib/utils";
import { SectionBlock } from "@/components/shared/section-block";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import { useAppStore } from "@/store/app-store";
import { useCopilotStore } from "@/store/copilot-store";

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorName: string;
  action: string;
  amount: string | null;
}

interface AuditData {
  log: AuditEntry[];
  needs_run?: boolean;
  run_request?: string;
}

export function AuditScreen() {
  const setPendingDraft = useCopilotStore((s) => s.setPendingDraft);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);
  const { data, loading, error, reload } = useDashboard<AuditData>("audit");

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div>
          <SectionBlock title="Ask about any number">
            <p className="text-sm text-ink-soft">
              Ask the copilot — every answer cites the memory-graph nodes it used.
            </p>
            <button
              type="button"
              onClick={() => {
                setPendingDraft("");
                setCopilotOpen(true);
              }}
              className="mt-2 inline-flex items-center rounded-sm border border-ink bg-ink px-2.5 py-1 text-xs text-paper hover:bg-ink/85"
            >
              Open Finertia copilot
            </button>
          </SectionBlock>

          <SectionBlock title="Immutable activity log">
            <div className="border-t-[1.5px] border-ink">
              {d.log.length === 0 && (
                <p className="py-3 text-sm text-ink-soft">No data source yet — N/A</p>
              )}
              {d.log.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1 border-b border-rule-soft py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="w-[172px] shrink-0 font-mono text-xs text-ink-soft">{entry.timestamp}</span>
                  <span
                    className={cn(
                      "w-[60px] shrink-0 font-mono text-2xs uppercase",
                      entry.actor === "system" ? "text-blue" : "text-ink",
                    )}
                  >
                    {entry.actor}
                  </span>
                  <span className="flex-1 text-sm text-ink">
                    {entry.action}
                    <span className="text-ink-soft"> — {entry.actorName}</span>
                  </span>
                  {entry.amount && <span className="font-mono text-sm text-ink">{entry.amount}</span>}
                </div>
              ))}
            </div>
          </SectionBlock>
        </div>
      )}
    </DashboardGate>
  );
}
