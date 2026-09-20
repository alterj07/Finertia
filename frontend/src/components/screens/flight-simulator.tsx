"use client";

import { useMemo, useState } from "react";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { useDashboard } from "@/lib/use-dashboard";
import { cn } from "@/lib/utils";

type Lever = "collections" | "payables" | "opex";
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
  collections: { label: "Receivables collection", description: "Bring customer cash forward", unit: "cash collected earlier" },
  payables: { label: "Payables timing", description: "Defer a planned vendor payment", unit: "cash retained temporarily" },
  opex: { label: "Operating expense", description: "Add a discretionary operating cost", unit: "cash deployed" },
};

function dollars(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value * 1000);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="border border-rule bg-paper-raised px-3 py-2 shadow-sm"><p className="font-mono text-2xs text-ink-soft">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 font-mono text-xs" style={{ color: item.color }}>{item.name}: {dollars(item.value)}</p>)}</div>;
}

export function FlightSimulatorScreen() {
  const [lever, setLever] = useState<Lever>("collections");
  const [amount, setAmount] = useState(150000);
  const [days, setDays] = useState(14);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceKey, setAdviceKey] = useState("");
  const { data: forecast } = useDashboard<ForecastData>("forecast");
  const liveCash = useMemo(
    () => forecast?.weeks?.length === 13 ? forecast.weeks.map((week) => Math.round(week.ending / 1000)) : baseCash,
    [forecast],
  );
  const [loading, setLoading] = useState(false);

  const scenario = useMemo(() => {
    const amountK = amount / 1000;
    return liveCash.map((cash, index) => {
      const affectedWeek = Math.min(Math.max(Math.ceil(days / 7) - 1, 0), 12);
      let delta = 0;
      if (lever === "collections") delta = index >= affectedWeek ? amountK : 0;
      if (lever === "payables") delta = index < affectedWeek ? amountK : 0;
      if (lever === "opex") delta = index >= affectedWeek ? -amountK : 0;
      return { week: labels[index], base: cash, scenario: cash + delta };
    });
  }, [amount, days, lever, liveCash]);

  const baseFloor = Math.min(...liveCash);
  const scenarioFloor = Math.min(...scenario.map((point) => point.scenario));
  const endDelta = scenario.at(-1)!.scenario - liveCash.at(-1)!;
  const floorDelta = scenarioFloor - baseFloor;
  const changes = endDelta !== 0 ? `${endDelta > 0 ? "+" : "−"}${dollars(Math.abs(endDelta))}` : "No change";
  const scenarioKey = `${lever}:${amount}:${days}`;

  async function getAdvice() {
    setLoading(true);
    try {
      const result = await apiFetch<Advice>("/api/flight-simulator/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lever, amount, timing_days: days, cash_delta: endDelta * 1000, minimum_cash_delta: floorDelta * 1000 }),
      });
      setAdvice(result);
      setAdviceKey(scenarioKey);
    } finally {
      setLoading(false);
    }
  }

  function reset() { setLever("collections"); setAmount(150000); setDays(14); }

  return <div className="stagger pb-8">
    <div className="mb-7 flex justify-end">
      <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink"><RotateCcw size={13} /> Reset scenario</button>
    </div>

    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="h-fit border border-rule bg-paper-raised p-4">
        <h2 className="font-serif text-lg">Scenario inputs</h2>
        <p className="mt-1 text-xs leading-5 text-ink-soft">One lever at a time keeps the result easy to inspect.</p>
        <label className="mt-5 block font-mono text-2xs uppercase tracking-wide text-ink-soft">Decision</label>
        <select value={lever} onChange={(e) => setLever(e.target.value as Lever)} className="mt-1.5 h-9 w-full border border-rule bg-paper px-2 text-sm text-ink focus:border-blue">
          {Object.entries(leverCopy).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
        </select>
        <p className="mt-1.5 text-2xs leading-4 text-ink-soft">{leverCopy[lever].description}</p>
        <label className="mt-5 block font-mono text-2xs uppercase tracking-wide text-ink-soft">Amount</label>
        <div className="mt-1.5 flex items-center border border-rule bg-paper"><span className="px-2 font-mono text-xs text-ink-soft">$</span><input aria-label="Scenario amount" type="number" min="1000" max="10000000" step="10000" value={amount} onChange={(e) => setAmount(Math.max(1000, Number(e.target.value) || 0))} className="h-9 min-w-0 flex-1 bg-transparent pr-2 font-mono text-sm outline-none" /></div>
        <label className="mt-5 flex justify-between font-mono text-2xs uppercase tracking-wide text-ink-soft"><span>Timing shift</span><span className="text-ink">{days} days</span></label>
        <input aria-label="Timing shift in days" type="range" min="0" max="42" step="7" value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-2 w-full accent-[var(--sim)]" />
        <div className="mt-2 flex justify-between font-mono text-2xs text-ink-soft"><span>Now</span><span>6 weeks</span></div>
        <div className="mt-6 border-t border-rule-soft pt-4 text-2xs leading-4 text-ink-soft">Simulation only · source data remains unchanged.</div>
      </aside>

      <div className="min-w-0">
        <div className="grid gap-2 sm:grid-cols-3">
          <Metric label="13-week ending cash" value={dollars(scenario.at(-1)!.scenario)} delta={changes} favorable={endDelta >= 0} />
          <Metric label="Cash floor" value={dollars(scenarioFloor)} delta={`${floorDelta >= 0 ? "+" : "−"}${dollars(Math.abs(floorDelta))}`} favorable={floorDelta >= 0} />
          <Metric label="Decision effect" value={leverCopy[lever].unit} small />
        </div>
        <section className="mt-5 border border-rule bg-paper-raised p-3 sm:p-4">
          <div className="mb-4 flex items-baseline justify-between"><div><h2 className="font-serif text-lg">Cash trajectory</h2><p className="mt-0.5 text-2xs text-ink-soft">Base plan compared with this simulation</p></div></div>
          <div className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={scenario} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}><CartesianGrid stroke="var(--rule-soft)" vertical={false}/><XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "var(--rule)" }} tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }}/><YAxis tickLine={false} axisLine={false} width={54} tickFormatter={(v) => `$${v}K`} tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--ink-soft)" }}/><Tooltip content={<CustomTooltip />}/><Legend iconType="plainline" wrapperStyle={{ fontSize: 11, paddingTop: 12 }}/><Line name="Base plan" dataKey="base" stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive/><Line name="Simulation" dataKey="scenario" stroke="var(--sim)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "var(--sim)", stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive animationDuration={450}/></LineChart></ResponsiveContainer></div>
        </section>
        <section className="mt-5 border border-rule bg-paper-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-2xs uppercase tracking-[0.14em] text-sim">Lean AI review</p><h2 className="mt-1 font-serif text-lg">Decision readout</h2><p className="mt-1 text-xs text-ink-soft">A compact scenario summary is sent only when requested.</p></div><button disabled={loading} onClick={getAdvice} className="inline-flex h-8 items-center gap-1.5 bg-sim px-3 text-xs text-paper transition-opacity hover:opacity-85 disabled:opacity-55"><Sparkles size={13}/>{loading ? "Reviewing…" : "Get recommendation"}</button></div>
          {advice && adviceKey === scenarioKey ? <div className="mt-4 border-t border-rule-soft pt-4"><div className="flex items-center gap-2"><span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-2xs uppercase", advice.verdict === "good" ? "bg-green-soft text-green" : advice.verdict === "bad" ? "bg-rust-soft text-rust" : "bg-gold-soft text-gold")}>{advice.verdict}</span><span className="text-2xs text-ink-soft">{advice.source === "openai" ? "AI-assisted" : "Rules-based fallback"}</span></div><p className="mt-3 text-sm text-ink"><span className="font-medium">Recommendation: </span>{advice.recommendation}</p><p className="mt-1.5 text-sm text-ink-soft"><span className="font-medium text-ink">Why: </span>{advice.why}</p></div> : <button onClick={getAdvice} className="mt-4 flex w-full items-center justify-between border-t border-rule-soft pt-4 text-left text-xs text-ink-soft hover:text-ink"><span>Review the modeled impact before deciding.</span><ArrowRight size={14}/></button>}
        </section>
      </div>
    </div>
  </div>;
}

function Metric({ label, value, delta, favorable, small = false }: { label: string; value: string; delta?: string; favorable?: boolean; small?: boolean }) {
  return <div className="border border-rule bg-paper-raised px-3 py-3"><p className="font-mono text-2xs uppercase tracking-wide text-ink-soft">{label}</p><p className={cn("mt-2 font-mono text-lg font-medium text-ink", small && "font-sans text-sm font-normal")}>{value}</p>{delta && <p className={cn("mt-1 font-mono text-2xs", favorable ? "text-green" : "text-rust")}>{delta} vs. base</p>}</div>;
}
