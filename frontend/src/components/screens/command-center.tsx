"use client";

import { useMemo, useState } from "react";
import { KpiRow } from "@/components/shared/kpi-row";
import { Ledger } from "@/components/shared/ledger";
import { ChecklistRow } from "@/components/shared/checklist-row";
import { SectionBlock } from "@/components/shared/section-block";
import { FilterChip } from "@/components/shared/filter-chip";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { useDashboard } from "@/lib/use-dashboard";
import type { ActionTag, ChecklistItemData, KpiCellData, LedgerRowData } from "@/lib/types";

interface CommandCenterData {
  kpis: KpiCellData[];
  activity: LedgerRowData[];
  checklist: ChecklistItemData[];
  needs_run?: boolean;
  run_request?: string;
}

const SEVERITY: Record<ActionTag, number> = { flag: 0, review: 1, auto: 2 };
const FILTERS: { id: "all" | ActionTag; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flag", label: "Flag" },
  { id: "review", label: "Review" },
  { id: "auto", label: "Auto" },
];

export function CommandCenterScreen() {
  const [filter, setFilter] = useState<"all" | ActionTag>("all");
  const { data, loading, error, reload } = useDashboard<CommandCenterData>("command-center");

  const rows = useMemo(() => {
    const activity = data?.activity ?? [];
    const sorted = [...activity].sort(
      (a, b) => SEVERITY[a.tag ?? "auto"] - SEVERITY[b.tag ?? "auto"],
    );
    if (filter === "all") return sorted;
    return sorted.filter((r) => r.tag === filter);
  }, [data, filter]);

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div className="stagger">
          <SectionBlock title="Today">
            <KpiRow cells={d.kpis} />
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
            <Ledger rows={rows} emptyState="No data source yet — N/A" />
          </SectionBlock>

          <SectionBlock title="Close status" action={{ label: "View full close checklist", href: "/close" }}>
            <div className="border border-rule bg-paper-raised px-4">
              {d.checklist.map((item) => (
                <ChecklistRow key={item.id} item={item} />
              ))}
            </div>
          </SectionBlock>
        </div>
      )}
    </DashboardGate>
  );
}
