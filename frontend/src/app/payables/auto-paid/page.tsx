"use client";

import Link from "next/link";
import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import type { LedgerRowData } from "@/lib/types";

interface PayablesData {
  auto_paid: { count: number | string; total: string; week_of: string };
  auto_paid_ledger: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export default function AutoPaidLedger() {
  const { data, loading, error, reload } = useDashboard<PayablesData>("payables");

  return (
    <div>
      <Link href="/payables" className="text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
        ← Back to Payables
      </Link>
      <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
        {(d) => (
          <SectionBlock title={`Auto-paid — payment run at ${d.auto_paid.week_of}`}>
            <p className="mb-3 text-xs text-ink-soft">
              {d.auto_paid.count} invoices, {d.auto_paid.total} total. Every
              row here matched an open purchase order within tolerance, came from a vendor with an
              established payment history, and was under the $5,000 auto-pay ceiling.
            </p>
            <Ledger rows={d.auto_paid_ledger} emptyState="No data source yet — N/A" />
          </SectionBlock>
        )}
      </DashboardGate>
    </div>
  );
}
