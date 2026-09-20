"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionBlock } from "@/components/shared/section-block";
import { Callout } from "@/components/shared/callout";
import { FilterChip } from "@/components/shared/filter-chip";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { Ledger } from "@/components/shared/ledger";
import { useDashboard } from "@/lib/use-dashboard";
import { useAppStore } from "@/store/app-store";
import { useCopilotStore } from "@/store/copilot-store";

interface ForecastWeek {
  label: string;
  inflows: number;
  outflows: number;
  ending: number;
}

interface ForecastData {
  opening: number;
  weeks: ForecastWeek[];
  unscheduled: { label: string; amount: string; reason: string }[];
  assumptions: string[];
  covenant: string;
  needs_run?: boolean;
  run_request?: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="border border-rule bg-paper-raised px-2.5 py-2 text-xs shadow-[0_2px_10px_rgba(var(--shadow-color),0.14)]">
      <div className="font-mono text-2xs text-ink-soft">{label}</div>
      <div className="mt-1 font-mono text-sm text-ink">${payload[0].value.toLocaleString()}K</div>
    </div>
  );
}

export function ForecastScreen() {
  const setPendingDraft = useCopilotStore((s) => s.setPendingDraft);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);
  const { data, loading, error, reload } = useDashboard<ForecastData>("forecast");

  function askWhatIf() {
    setPendingDraft("What if ");
    setCopilotOpen(true);
  }

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => {
        const chartData = d.weeks.map((w) => ({
          week: w.label,
          cash: Math.round(w.ending / 1000),
        }));
        return (
          <div>
            <SectionBlock title="13-week cash forecast">
              <div className="border border-rule bg-paper-raised px-3 pb-2 pt-4 sm:px-4">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="var(--rule-soft)" vertical={false} />
                      <XAxis
                        dataKey="week"
                        tick={{ fontSize: 10.5, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }}
                        axisLine={{ stroke: "var(--rule)" }}
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis
                        tick={{ fontSize: 10.5, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `$${v.toLocaleString()}K`}
                        width={64}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--ink-soft)", strokeDasharray: "3 3" }} />
                      <Line
                        dataKey="cash"
                        stroke="var(--forecast)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3.5, fill: "var(--forecast)", stroke: "var(--paper)", strokeWidth: 1.5 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <FilterChip label="Base" active />
                <FilterChip label="+ ask a question" onClick={askWhatIf} />
                <span className="ml-auto font-mono text-2xs text-ink-soft">
                  Covenant floor: {d.covenant}
                </span>
              </div>
            </SectionBlock>

            {d.unscheduled.length > 0 && (
              <SectionBlock title="Unscheduled">
                <Ledger
                  rows={d.unscheduled.map((u) => ({
                    id: u.label,
                    primary: u.label,
                    secondary: u.reason,
                    amount: u.amount,
                  }))}
                />
              </SectionBlock>
            )}

            <SectionBlock title="Assumptions">
              {d.assumptions.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
                  {d.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : (
                <Callout>No assumptions — N/A</Callout>
              )}
            </SectionBlock>
          </div>
        );
      }}
    </DashboardGate>
  );
}
