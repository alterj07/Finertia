"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type DotItemDotProps,
} from "recharts";
import { ApiError, apiFetch } from "@/lib/api";
import { useDashboard } from "@/lib/use-dashboard";
import { cn } from "@/lib/utils";

type Lever = "collections" | "payables" | "opex" | "debt" | "capex";
type Verdict = "good" | "bad" | "neutral";

interface Advice {
  verdict: Verdict;
  recommendation: string;
  why: string;
  source: "openai" | "rules";
}

const baseCash = [842, 794, 752, 772, 738, 706, 731, 718, 751, 768, 742, 779, 805];
const labels = baseCash.map((_, i) => `W${i + 1}`);

interface ForecastData {
  weeks: { label: string; ending: number }[];
}

const leverCopy: Record<Lever, { label: string; description: string; unit: string }> = {
  collections: { label: "Receivables collection", description: "", unit: "cash collected earlier" },
  payables: { label: "Payables timing", description: "Defer a planned vendor payment", unit: "cash retained temporarily" },
  opex: { label: "Operating expense", description: "Add a discretionary operating cost", unit: "cash deployed" },
  debt: { label: "Draw on credit line", description: "One-time cash injection against available credit", unit: "cash injected" },
  capex: { label: "Capital expenditure", description: "One-time investment in equipment or infrastructure", unit: "cash deployed" },
};

function dollars(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value * 1000);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="border border-rule bg-paper-raised px-3 py-2 shadow-sm"><p className="font-mono text-2xs text-ink-soft">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 font-mono text-xs" style={{ color: item.color }}>{item.name}: {dollars(item.value)}</p>)}</div>;
}

function ImpactTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="border border-rule bg-paper-raised px-3 py-2 shadow-sm">
      <p className="font-mono text-2xs text-ink-soft">{label}</p>
      <p className={cn("mt-1 font-mono text-xs", value >= 0 ? "text-green" : "text-rust")}>
        {value >= 0 ? "+" : "−"}{dollars(Math.abs(value))} vs. base
      </p>
    </div>
  );
}

/** Every point rides invisible; the last one gets a permanent pulsing marker
 * so the chart always has a "you are here" beat, not just a static line. */
function EndpointDot(props: DotItemDotProps) {
  const { cx, cy, index, points } = props;
  const isLast = points ? index === points.length - 1 : false;
  if (!isLast || cx == null || cy == null) return <g />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="var(--sim)" opacity={0.28}>
        <animate attributeName="r" values="7;11;7" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.32;0.06;0.32" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4.5} fill="var(--sim)" stroke="var(--paper)" strokeWidth={2} />
    </g>
  );
}


export function FlightSimulatorScreen() {
  const [lever, setLever] = useState<Lever>("collections");
  const [amount, setAmount] = useState(150000);
  const [days, setDays] = useState(14);
  const [confidence, setConfidence] = useState(100);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceKey, setAdviceKey] = useState("");
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const { data: forecast } = useDashboard<ForecastData>("forecast");
  const liveCash = useMemo(
    () => forecast?.weeks?.length === 13 ? forecast.weeks.map((week) => Math.round(week.ending / 1000)) : baseCash,
    [forecast],
  );
  const [loading, setLoading] = useState(false);

  const scenario = useMemo(() => {
    const amountK = (amount / 1000) * (confidence / 100);
    return liveCash.map((cash, index) => {
      const affectedWeek = Math.min(Math.max(Math.ceil(days / 7) - 1, 0), 12);
      let delta = 0;
      if (lever === "collections") delta = index >= affectedWeek ? amountK : 0;
      if (lever === "payables") delta = index < affectedWeek ? amountK : 0;
      if (lever === "opex") delta = index >= affectedWeek ? -amountK : 0;
      if (lever === "debt") delta = index === affectedWeek ? amountK : 0;
      if (lever === "capex") delta = index === affectedWeek ? -amountK : 0;
      return { week: labels[index], base: cash, scenario: cash + delta };
    });
  }, [amount, confidence, days, lever, liveCash]);

  const weeklyImpact = useMemo(
    () => scenario.map((point) => ({ week: point.week, impact: point.scenario - point.base })),
    [scenario],
  );

  const baseFloor = Math.min(...liveCash);
  const scenarioFloor = Math.min(...scenario.map((point) => point.scenario));
  const floorWeek = scenario.find((point) => point.scenario === scenarioFloor)?.week ?? scenario[0].week;
  const endDelta = scenario.at(-1)!.scenario - liveCash.at(-1)!;
  const floorDelta = scenarioFloor - baseFloor;
  const changes = endDelta !== 0 ? `${endDelta > 0 ? "+" : "−"}${dollars(Math.abs(endDelta))}` : "No change";
  const scenarioKey = `${lever}:${amount}:${days}:${confidence}`;

  async function getAdvice() {
    setLoading(true);
    setAdviceError(null);
    try {
      const result = await apiFetch<Advice>("/api/flight-simulator/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lever, amount, timing_days: days, confidence_pct: confidence, cash_delta: endDelta * 1000, minimum_cash_delta: floorDelta * 1000 }),
      });
      setAdvice(result);
      setAdviceKey(scenarioKey);
    } catch (err) {
      setAdvice(null);
      setAdviceError(err instanceof ApiError ? err.message : "Couldn't reach the analysis service. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() { setLever("collections"); setAmount(150000); setDays(14); setConfidence(100); }

  return <div className="stagger pb-8">
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-4">
        <div className="border border-rule bg-paper-raised p-4">
          <h2 className="font-serif text-lg">Scenario inputs</h2>
          <label className="mt-5 block font-mono text-2xs uppercase tracking-wide text-ink-soft">Decision</label>
          <select value={lever} onChange={(e) => setLever(e.target.value as Lever)} className="mt-1.5 h-9 w-full border border-rule bg-paper px-2 text-sm text-ink focus:border-blue">
            {Object.entries(leverCopy).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
          </select>
          {leverCopy[lever].description && <p className="mt-1.5 text-2xs leading-4 text-ink-soft">{leverCopy[lever].description}</p>}
          <label className="mt-5 block font-mono text-2xs uppercase tracking-wide text-ink-soft">Amount</label>
          <div className="mt-1.5 flex items-center border border-rule bg-paper"><span className="px-2 font-mono text-xs text-ink-soft">$</span><input aria-label="Scenario amount" type="number" min="1000" max="10000000" step="10000" value={amount} onChange={(e) => setAmount(Math.max(1000, Number(e.target.value) || 0))} className="h-9 min-w-0 flex-1 bg-transparent pr-2 font-mono text-sm outline-none" /></div>
          <label className="mt-5 flex justify-between font-mono text-2xs uppercase tracking-wide text-ink-soft"><span>Timing shift</span><span className="text-ink">{days} days</span></label>
          <input aria-label="Timing shift in days" type="range" min="0" max="42" step="7" value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-2 w-full accent-[var(--sim)]" />
          <div className="mt-2 flex justify-between font-mono text-2xs text-ink-soft"><span>Now</span><span>6 weeks</span></div>
          <label className="mt-5 flex justify-between font-mono text-2xs uppercase tracking-wide text-ink-soft"><span>Confidence</span><span className="text-ink">{confidence}%</span></label>
          <input aria-label="Confidence in this scenario" type="range" min="10" max="100" step="10" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-2 w-full accent-[var(--sim)]" />
          <button onClick={reset} className="mt-5 inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink"><RotateCcw size={13} /> Reset scenario</button>
        </div>

        <div className="flex flex-1 flex-col border border-rule bg-paper-raised p-4">
          <h2 className="font-serif text-lg">Decision readout</h2>
          <button disabled={loading} onClick={getAdvice} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 bg-sim px-3 text-xs text-paper transition-opacity hover:opacity-85 disabled:opacity-55"><Sparkles size={13}/>{loading ? "Reviewing…" : "Get recommendation"}</button>
          {advice && adviceKey === scenarioKey ? (
            <div className="mt-4 border-t border-rule-soft pt-4">
              <div className="flex items-center gap-2"><span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-2xs uppercase", advice.verdict === "good" ? "bg-green-soft text-green" : advice.verdict === "bad" ? "bg-rust-soft text-rust" : "bg-gold-soft text-gold")}>{advice.verdict}</span>{advice.source === "openai" && <span className="text-2xs text-ink-soft">AI-assisted</span>}</div>
              <p className="mt-3 text-sm text-ink"><span className="font-medium">Recommendation: </span>{advice.recommendation}</p>
              <p className="mt-1.5 text-sm text-ink-soft"><span className="font-medium text-ink">Why: </span>{advice.why}</p>
            </div>
          ) : adviceError ? (
            <p className="mt-4 border-t border-rule-soft pt-4 text-xs text-rust">{adviceError}</p>
          ) : (
            <p className="mt-4 border-t border-rule-soft pt-4 text-xs text-ink-soft">No recommendation yet.</p>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="13-week ending cash" value={dollars(scenario.at(-1)!.scenario)} delta={changes} favorable={endDelta >= 0} />
          <Metric label="Cash floor" value={dollars(scenarioFloor)} delta={`${floorDelta >= 0 ? "+" : "−"}${dollars(Math.abs(floorDelta))}`} favorable={floorDelta >= 0} />
          <Metric label="Decision effect" value={leverCopy[lever].unit} small />
        </div>
        <section className="mt-5 border border-rule bg-paper-raised p-3 sm:p-4">
          <div className="mb-3 flex items-baseline justify-between"><div><h2 className="font-serif text-lg">Cash trajectory</h2><p className="mt-0.5 text-2xs text-ink-soft">Base plan compared with this simulation</p></div></div>
          <div className="h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart key={scenarioKey} data={scenario} margin={{ top: 14, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="simFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--sim)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--sim)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--rule-soft)" vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "var(--rule)" }} tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }} />
                <YAxis tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `$${v}K`} tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--rule)", strokeDasharray: "3 3" }} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {floorWeek !== scenario.at(-1)!.week && (
                  <ReferenceDot
                    x={floorWeek}
                    y={scenarioFloor}
                    r={4}
                    fill="var(--paper)"
                    stroke="var(--rust)"
                    strokeWidth={2}
                    label={{ value: "Floor", position: "bottom", fill: "var(--rust)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                  />
                )}
                <Line name="Base plan" dataKey="base" stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive animationDuration={500} animationEasing="ease-out" />
                <Area
                  name="Simulation"
                  dataKey="scenario"
                  stroke="var(--sim)"
                  strokeWidth={2.5}
                  fill="url(#simFill)"
                  dot={EndpointDot}
                  activeDot={{ r: 5, fill: "var(--sim)", stroke: "var(--paper)", strokeWidth: 2 }}
                  isAnimationActive
                  animationDuration={650}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="mt-4 border border-rule bg-paper-raised p-3 sm:p-4">
          <div className="mb-3"><h2 className="font-serif text-lg">Weekly cash impact</h2><p className="mt-0.5 text-2xs text-ink-soft">Difference from base plan, week by week</p></div>
          <div className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart key={scenarioKey} data={weeklyImpact} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="posBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--green)" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="negBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--rust)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--rust)" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--rule-soft)" vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "var(--rule)" }} tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }} />
                <YAxis domain={["dataMin - 15", "dataMax + 15"]} tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `$${v}K`} tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }} />
                <ReferenceLine y={0} stroke="var(--rule)" strokeWidth={1.25} />
                <Tooltip content={<ImpactTooltip />} cursor={{ fill: "var(--rule-soft)" }} />
                <Bar dataKey="impact" radius={[3, 3, 3, 3]} isAnimationActive animationDuration={500} animationEasing="ease-out">
                  {weeklyImpact.map((point) => (
                    <Cell key={point.week} fill={point.impact >= 0 ? "url(#posBar)" : "url(#negBar)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  </div>;
}

function Metric({ label, value, delta, favorable, small = false }: { label: string; value: string; delta?: string; favorable?: boolean; small?: boolean }) {
  return <div className="border border-rule bg-paper-raised px-3 py-3"><p className="font-mono text-2xs uppercase tracking-wide text-ink-soft">{label}</p><p className={cn("mt-2 font-mono text-lg font-medium text-ink", small && "font-sans text-sm font-normal")}>{value}</p>{delta && <p className={cn("mt-1 font-mono text-2xs", favorable ? "text-green" : "text-rust")}>{delta} vs. base</p>}</div>;
}
