"use client";

import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { Callout } from "@/components/shared/callout";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import type { LedgerRowData } from "@/lib/types";

interface PayablesData {
  queue: LedgerRowData[];
  auto_paid: { count: number | string; total: string; week_of: string; on_hold: number | string };
  auto_paid_ledger: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export function PayablesScreen() {
  const { data, loading, error, reload } = useDashboard<PayablesData>("payables");

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div>
          <SectionBlock title="Needs your approval">
            <Ledger
              rows={d.queue}
              emptyState="No data source yet — N/A"
            />
          </SectionBlock>

          <SectionBlock title="This week, auto-paid" action={{ label: "View full auto-paid ledger", href: "/payables/auto-paid" }}>
            <p className="font-mono text-lg text-ink">
              {d.auto_paid.count} invoices · {d.auto_paid.total}
            </p>
            <p className="mb-2.5 text-xs text-ink-soft">
              Payment run at {d.auto_paid.week_of} · {d.auto_paid.on_hold} on hold
            </p>
            <Callout>
              Auto-pay policy releases an invoice without human review when it matches an open purchase
              order within 3% tolerance, comes from a vendor with an established payment history, and
              totals under $5,000.
            </Callout>
          </SectionBlock>
        </div>
      )}
    </DashboardGate>
  );
}
