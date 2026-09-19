import { GROUP_COLOR, GROUP_LABEL } from "@/lib/graph-utils";
import type { GraphGroup } from "@/lib/types";

const ORDER: GraphGroup[] = [
  "agent",
  "payables",
  "receivables",
  "reconciliation",
  "close",
  "forecast",
  "audit",
];

export function GraphLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 border border-rule bg-paper-raised/95 px-3 py-2.5 text-xs backdrop-blur-sm">
      <ul className="flex flex-col gap-1">
        {ORDER.map((g) => (
          <li key={g} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: GROUP_COLOR[g] }}
              aria-hidden
            />
            <span className="text-ink-soft">{GROUP_LABEL[g]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
