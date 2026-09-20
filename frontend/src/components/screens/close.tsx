"use client";

import { ChecklistRow } from "@/components/shared/checklist-row";
import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import type { ChecklistItemData, LedgerRowData } from "@/lib/types";

interface CloseData {
  checklist: ChecklistItemData[];
  days_remaining: string;
  variance_flags: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export function CloseScreen() {
  const { data, loading, error, reload } = useDashboard<CloseData>("close");

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div>
          <SectionBlock
            title="Close checklist"
            headerRight={
              <span className="font-mono text-sm text-gold">
                {d.days_remaining} days remaining
              </span>
            }
          >
            <div className="border border-rule bg-paper-raised px-4">
              {d.checklist.map((item) => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </div>
          </SectionBlock>

          <SectionBlock title="Variance flags">
            <Ledger rows={d.variance_flags} emptyState="No data source yet — N/A" />
          </SectionBlock>
        </div>
      )}
    </DashboardGate>
  );
}
