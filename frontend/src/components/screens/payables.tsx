"use client";

import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { Callout } from "@/components/shared/callout";
import { PAYABLES_APPROVAL_QUEUE, PAYABLES_AUTO_PAID_SUMMARY } from "@/lib/mock/payables";

export function PayablesScreen() {
  return (
    <div>
      <SectionBlock
        title="Needs your approval"
        headerRight={
          <div className="flex gap-2">
            <button type="button" className="rounded-sm border border-ink bg-ink px-2.5 py-1 text-xs text-paper hover:bg-ink/85">
              Approve all under policy
            </button>
            <button type="button" className="rounded-sm border border-rule px-2.5 py-1 text-xs text-ink hover:border-ink-soft">
              Escalate all flagged
            </button>
          </div>
        }
      >
        <Ledger
          rows={PAYABLES_APPROVAL_QUEUE}
          emptyState="No exceptions today — every invoice this cycle matched policy."
        />
      </SectionBlock>

      <SectionBlock title="This week, auto-paid" action={{ label: "View full auto-paid ledger", href: "/payables/auto-paid" }}>
        <p className="font-mono text-lg text-ink">
          {PAYABLES_AUTO_PAID_SUMMARY.count} invoices · {PAYABLES_AUTO_PAID_SUMMARY.total}
        </p>
        <p className="mb-2.5 text-xs text-ink-soft">Week of {PAYABLES_AUTO_PAID_SUMMARY.weekOf}</p>
        <Callout>
          Auto-pay policy releases an invoice without human review when it matches an open purchase
          order within 3% tolerance, comes from a vendor with an established payment history, and
          totals under $5,000.
        </Callout>
      </SectionBlock>
    </div>
  );
}
