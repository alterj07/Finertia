"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
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
const TAG_LABEL: Record<ActionTag, string> = { flag: "Flag", review: "Review", auto: "Auto" };
const TAG_VAR: Record<ActionTag, string> = {
  flag: "var(--rust)",
  review: "var(--gold)",
  auto: "var(--green)",
};

function ActivityBreakdown({ activity }: { activity: LedgerRowData[] }) {
  const counts = useMemo(() => {
    const c: Record<ActionTag, number> = { flag: 0, review: 0, auto: 0 };
    for (const r of activity) c[r.tag ?? "auto"] += 1;
    return c;
  }, [activity]);
  const data = (Object.keys(TAG_LABEL) as ActionTag[])
    .map((tag) => ({ tag, value: counts[tag] }))
    .filter((d) => d.value > 0);

  return (
    <div className="flex flex-col items-center justify-center border border-rule bg-paper-raised px-4 py-6">
      {data.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing to break down yet.</p>
      ) : (
        <>
          <div className="h-[150px] w-[150px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="tag"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={3}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell key={d.tag} fill={TAG_VAR[d.tag]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex w-full flex-col gap-1.5">
            {data.map((d) => (
              <div key={d.tag} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TAG_VAR[d.tag] }}
                  aria-hidden
                />
                <span className="text-ink-soft">{TAG_LABEL[d.tag]}</span>
                <span className="ml-auto font-mono text-ink">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
            <KpiRow cells={d.kpis.filter((k) => k.label !== "Runway")} />
          </SectionBlock>

          <SectionBlock
            title="Agent activity"
            headerRight={
              <div className="flex gap-1.5">
                {FILTERS.map((f) => (
                  <FilterChip key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />
                ))}
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-[1fr_200px]">
              <Ledger rows={rows} emptyState="No data source yet — N/A" />
              <ActivityBreakdown activity={data?.activity ?? []} />
            </div>
          </SectionBlock>

          <SectionBlock
            title="Close status"
            action={{ label: "View full close checklist", href: "/financial-operations?tab=close" }}
          >
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
