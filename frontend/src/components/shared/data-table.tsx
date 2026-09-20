import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useHighlightStore } from "@/store/highlight-store";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Hide on narrow screens to keep dense tables usable on mobile. */
  hideOnMobile?: boolean;
  render: (row: T) => ReactNode;
}

/** Dense, bordered, spreadsheet-style table — the shared grid every
 * Financial Operations tab renders its records in. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyState,
  onRowClick,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  emptyState?: string;
  onRowClick?: (row: T) => void;
}) {
  const highlightIds = useHighlightStore((s) => s.ids);
  const highlightToken = useHighlightStore((s) => s.token);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightToken === 0) return;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    // rAF: let this render's rows commit to the DOM first, so the
    // data-row-id query below actually finds the target.
    const raf = requestAnimationFrame(() => {
      const matches = rows.filter((r) => highlightIds.has(r.id));
      if (matches.length === 0) return;
      setFlashing(new Set(matches.map((r) => r.id)));
      const el = containerRef.current?.querySelector(
        `[data-row-id="${CSS.escape(matches[0].id)}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      clearTimer = setTimeout(() => setFlashing(new Set()), 2200);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (clearTimer) clearTimeout(clearTimer);
    };
    // Only the token should retrigger this — `rows`/`highlightIds` change on
    // every render otherwise and would replay the flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightToken]);

  if (rows.length === 0) {
    return (
      <div className="border-t-[1.5px] border-ink py-6">
        <p className="text-sm text-ink-soft">{emptyState ?? "Nothing to show."}</p>
      </div>
    );
  }

  // Scale the minimum width with the actual column count so a lean 4-column
  // table (e.g. AP/AR after trimming columns) doesn't force horizontal
  // scrolling just because a wider table elsewhere needed a bigger floor.
  const minWidth = Math.max(320, columns.length * 100);

  return (
    <div ref={containerRef} className="scroll-thin overflow-x-auto border-t-[1.5px] border-ink">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-rule-soft">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-1.5 py-2 font-mono text-2xs font-normal tracking-wide text-ink-soft uppercase",
                  c.align === "right" && "text-right",
                  c.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="stagger-fast">
          {rows.map((row) => (
            <tr
              key={row.id}
              data-row-id={row.id}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-rule-soft last:border-b-0",
                onRowClick && "cursor-pointer hover:bg-paper-raised",
                flashing.has(row.id) && "animate-row-flash",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-1.5 py-2.5 align-middle text-sm text-ink",
                    c.align === "right" && "text-right",
                    c.hideOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
