import { Circle } from "lucide-react";

/** Generalised status vocabulary for tabular workflows (AP/AR, recon, close,
 * audit, forecast) — same visual language as StatusTag, but not limited to
 * the three-value ActionTag enum. */
export type Tone = "positive" | "warning" | "critical" | "info" | "neutral" | "forecast";

// A small solid-colored dot instead of a translucent bordered chip — reads
// as a status indicator, not a placeholder-looking pill.
const TONE_COLOR: Record<Tone, string> = {
  positive: "text-green",
  warning: "text-gold",
  critical: "text-rust",
  info: "text-blue",
  neutral: "text-ink-soft",
  // shares the Flight Simulator's lime accent — same domain, same color
  forecast: "text-sim",
};

export function ToneBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs leading-none whitespace-nowrap text-ink-soft">
      <Circle size={8} className={TONE_COLOR[tone]} fill="currentColor" stroke="none" aria-hidden />
      {label}
    </span>
  );
}
