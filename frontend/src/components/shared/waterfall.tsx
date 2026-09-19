import { cn } from "@/lib/utils";
import type { WaterfallSpec } from "@/lib/types";

const BAR_CLASS: Record<string, string> = {
  start: "bg-ink-soft/50",
  end: "bg-ink-soft/50",
  positive: "bg-green",
  negative: "bg-rust",
};

const MAX_HEIGHT = 64;
const MIN_HEIGHT = 5;

export function Waterfall({ spec }: { spec: WaterfallSpec }) {
  const max = Math.max(...spec.bars.map((b) => Math.abs(b.value)), 1);
  return (
    <div className="flex items-end gap-3 pt-2" style={{ height: MAX_HEIGHT + 28 }}>
      {spec.bars.map((bar) => {
        const height = Math.max(MIN_HEIGHT, (Math.abs(bar.value) / max) * MAX_HEIGHT);
        return (
          <div key={bar.label} className="flex w-14 flex-col items-center justify-end gap-1">
            <span className="font-mono text-2xs text-ink-soft">
              {bar.value > 0 && (bar.kind === "positive" || bar.kind === "negative") ? "+" : ""}
              {bar.value}
              {spec.unit ?? ""}
            </span>
            <div
              className={cn("w-6 rounded-t-sm", BAR_CLASS[bar.kind])}
              style={{ height }}
              aria-hidden
            />
            <span className="text-2xs text-ink-soft">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}
