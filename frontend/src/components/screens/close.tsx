"use client";

import { ChecklistRow } from "@/components/shared/checklist-row";
import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { CLOSE_CHECKLIST, CLOSE_DAYS_REMAINING, VARIANCE_FLAGS } from "@/lib/mock/close";

export function CloseScreen() {
  return (
    <div>
      <SectionBlock
        title="Close checklist"
        headerRight={
          <span className="font-mono text-sm text-gold">
            {CLOSE_DAYS_REMAINING} days remaining
          </span>
        }
      >
        <div className="border border-rule bg-paper-raised px-4">
          {CLOSE_CHECKLIST.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </div>
      </SectionBlock>

      <SectionBlock title="Variance flags">
        <Ledger rows={VARIANCE_FLAGS} emptyState="No variances outside tolerance this period." />
      </SectionBlock>
    </div>
  );
}
