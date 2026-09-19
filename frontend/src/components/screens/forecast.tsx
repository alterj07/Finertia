"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionBlock } from "@/components/shared/section-block";
import { Callout } from "@/components/shared/callout";
import { FilterChip } from "@/components/shared/filter-chip";
import { COVENANT_FLOOR, FORECAST_SCENARIOS } from "@/lib/mock/forecast";
import { useAppStore } from "@/store/app-store";
import { useCopilotStore } from "@/store/copilot-store";

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { cash: number; low: number; high: number } }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="border border-rule bg-paper-raised px-2.5 py-2 text-xs shadow-[0_2px_10px_rgba(var(--shadow-color),0.14)]">
      <div className="font-mono text-2xs text-ink-soft">{label}</div>
      <div className="mt-1 font-mono text-sm text-ink">${point.cash.toLocaleString()}K</div>
      <div className="mt-0.5 font-mono text-2xs text-ink-soft">
        range ${point.low.toLocaleString()}K – ${point.high.toLocaleString()}K
      </div>
    </div>
  );
}

export function ForecastScreen() {
  const [scenarioId, setScenarioId] = useState(FORECAST_SCENARIOS[0].id);
  const setPendingDraft = useCopilotStore((s) => s.setPendingDraft);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);

  const scenario = useMemo(
    () => FORECAST_SCENARIOS.find((s) => s.id === scenarioId) ?? FORECAST_SCENARIOS[0],
    [scenarioId],
  );

  const chartData = scenario.points.map((p) => ({
    ...p,
    range: [p.low, p.high],
  }));

  function askWhatIf() {
    setPendingDraft("What if ");
    setCopilotOpen(true);
  }

  return (
    <div>
      <SectionBlock title="13-week cash forecast">
        <div className="border border-rule bg-paper-raised px-3 pb-2 pt-4 sm:px-4">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
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
                <ReferenceLine
                  y={COVENANT_FLOOR}
                  stroke="var(--ink-soft)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `Covenant floor $${COVENANT_FLOOR.toLocaleString()}K`,
                    position: "insideTopLeft",
                    fill: "var(--ink-soft)",
                    fontSize: 10.5,
                  }}
                />
                <Area
                  dataKey="range"
                  stroke="none"
                  fill="var(--forecast-soft)"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="cash"
                  stroke="var(--forecast)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "var(--forecast)", stroke: "var(--paper)", strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FORECAST_SCENARIOS.map((s) => (
            <FilterChip
              key={s.id}
              label={s.label}
              active={s.id === scenarioId}
              onClick={() => setScenarioId(s.id)}
            />
          ))}
          <FilterChip label="+ ask a question" onClick={askWhatIf} />
        </div>
      </SectionBlock>

      <SectionBlock title="Reading">
        <Callout>
          Under {scenario.label.toLowerCase()}, cash troughs at ${scenario.trough.toLocaleString()}K
          in week {scenario.troughWeek}, leaving ${scenario.headroom.toLocaleString()}K of headroom
          above the ${COVENANT_FLOOR.toLocaleString()}K covenant floor.
        </Callout>
      </SectionBlock>
    </div>
  );
}
