import { cn } from "@/lib/utils";
import { RollingFigure } from "@/components/shared/rolling-figure";
import type { KpiCellData } from "@/lib/types";

const SM_COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

export function KpiRow({ cells }: { cells: KpiCellData[] }) {
  return (
    <div
      className={cn(
        "stagger-fast grid grid-cols-2 border border-rule bg-paper-raised",
        SM_COLS[cells.length] ?? "sm:grid-cols-4",
      )}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={cn(
            "border-rule px-4 py-3.5",
            i % 2 === 1 && "border-l",
            i >= 2 && "border-t sm:border-t-0",
            i > 0 && "sm:border-l",
          )}
        >
          <div className="text-xs text-ink-soft">{cell.label}</div>
          <div className="mt-1 font-serif text-2xl leading-none text-ink">
            <RollingFigure value={cell.value} />
          </div>
          {cell.delta && (
            <div
              className={cn(
                "mt-1.5 font-mono text-2xs",
                cell.favorable === undefined
                  ? "text-ink-soft"
                  : cell.favorable
                    ? "text-green"
                    : "text-rust",
              )}
            >
              {cell.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
