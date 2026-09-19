"use client";

import { useMemo, useState } from "react";
import { KpiRow } from "@/components/shared/kpi-row";
import { Ledger } from "@/components/shared/ledger";
import { ChecklistRow } from "@/components/shared/checklist-row";
import { SectionBlock } from "@/components/shared/section-block";
import { FilterChip } from "@/components/shared/filter-chip";
import { COMMAND_CENTER_KPIS, OVERNIGHT_ACTIVITY, CLOSE_MINI_CHECKLIST } from "@/lib/mock/command-center";
import type { ActionTag } from "@/lib/types";

const SEVERITY: Record<ActionTag, number> = { flag: 0, review: 1, auto: 2 };
const FILTERS: { id: "all" | ActionTag; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flag", label: "Flag" },
  { id: "review", label: "Review" },
  { id: "auto", label: "Auto" },
];

export function CommandCenterScreen() {
  const [filter, setFilter] = useState<"all" | ActionTag>("all");

  const rows = useMemo(() => {
    const sorted = [...OVERNIGHT_ACTIVITY].sort(
      (a, b) => SEVERITY[a.tag ?? "auto"] - SEVERITY[b.tag ?? "auto"],
    );
    if (filter === "all") return sorted;
    return sorted.filter((r) => r.tag === filter);
  }, [filter]);

  return (
    <div>
      <SectionBlock title="Today">
        <KpiRow cells={COMMAND_CENTER_KPIS} />
      </SectionBlock>

      <SectionBlock
        title="Overnight agent activity"
        headerRight={
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <FilterChip key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />
            ))}
          </div>
        }
      >
        <Ledger rows={rows} emptyState="No overnight activity matches this filter." />
      </SectionBlock>

      <SectionBlock title="Close status" action={{ label: "View full close checklist", href: "/close" }}>
        <div className="border border-rule bg-paper-raised px-4">
          {CLOSE_MINI_CHECKLIST.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}
