"use client";

import { KpiRow } from "@/components/shared/kpi-row";
import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { RECEIVABLES_AGING, COLLECTIONS_ACTIVITY } from "@/lib/mock/receivables";

export function ReceivablesScreen() {
  return (
    <div>
      <SectionBlock title="Aging">
        <KpiRow cells={RECEIVABLES_AGING} />
      </SectionBlock>

      <SectionBlock title="Collections activity">
        <Ledger
          rows={COLLECTIONS_ACTIVITY}
          emptyState="No collections activity today — every account is current or already being worked."
        />
      </SectionBlock>
    </div>
  );
}
