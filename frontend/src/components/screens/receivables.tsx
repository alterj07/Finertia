"use client";

import { KpiRow } from "@/components/shared/kpi-row";
import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import type { KpiCellData, LedgerRowData } from "@/lib/types";

interface ReceivablesData {
  aging: KpiCellData[];
  collections: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export function ReceivablesScreen() {
  const { data, loading, error, reload } = useDashboard<ReceivablesData>("receivables");

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div>
          <SectionBlock title="Aging">
            <KpiRow cells={d.aging} />
          </SectionBlock>

          <SectionBlock title="Collections activity">
            <Ledger
              rows={d.collections}
              emptyState="No data source yet — N/A"
            />
          </SectionBlock>
        </div>
      )}
    </DashboardGate>
  );
}
