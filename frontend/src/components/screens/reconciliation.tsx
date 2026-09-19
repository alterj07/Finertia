"use client";

import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { RECONCILIATION_ACCOUNTS } from "@/lib/mock/reconciliation";

export function ReconciliationScreen() {
  return (
    <div>
      <SectionBlock title="Connected accounts">
        <Ledger rows={RECONCILIATION_ACCOUNTS} />
      </SectionBlock>
    </div>
  );
}
