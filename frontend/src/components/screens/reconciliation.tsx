"use client";

import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import type { LedgerRowData } from "@/lib/types";

interface ReconciliationData {
  accounts: LedgerRowData[];
  findings: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export function ReconciliationScreen() {
  const { data, loading, error, reload } = useDashboard<ReconciliationData>("reconciliation");

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div className="stagger">
          <SectionBlock title="Connected accounts">
            <Ledger rows={d.accounts} emptyState="No data source yet — N/A" />
          </SectionBlock>

          <SectionBlock title="Recon findings">
            <Ledger rows={d.findings} emptyState="No recon findings yet — N/A" />
          </SectionBlock>
        </div>
      )}
    </DashboardGate>
  );
}
