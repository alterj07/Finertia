"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LedgerRowData, RowAction } from "@/lib/types";
import { StatusTag } from "@/components/shared/status-tag";
import { Waterfall } from "@/components/shared/waterfall";

function ActionButton({ action }: { action: RowAction }) {
  const className = cn(
    "inline-flex items-center rounded-sm border px-2.5 py-1 text-xs transition-colors",
    action.kind === "primary" && "border-ink bg-ink text-paper hover:bg-ink/85",
    action.kind === "secondary" && "border-rule text-ink hover:border-ink-soft",
    action.kind === "ghost" && "border-transparent text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink",
  );
  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={className}>
      {action.label}
    </button>
  );
}

function LedgerRow({ row }: { row: LedgerRowData }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!row.detail;

  return (
    <div className="border-b border-rule-soft last:border-b-0">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        className={cn(
          "flex w-full flex-col gap-1.5 px-1 py-3 text-left sm:flex-row sm:items-center sm:gap-3",
          hasDetail && "cursor-pointer hover:bg-paper-raised",
        )}
      >
        <div className="flex items-start gap-2 sm:w-auto sm:flex-1 sm:items-center">
          {row.tag && <StatusTag tag={row.tag} className="mt-0.5 sm:mt-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink">{row.primary}</div>
            {row.secondary && <div className="mt-0.5 text-xs text-ink-soft">{row.secondary}</div>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pl-0 sm:justify-end sm:pl-0">
          {row.amount && (
            <span className="font-mono text-sm text-ink">{row.amount}</span>
          )}
          {hasDetail ? (
            <ChevronRight
              size={15}
              className={cn("shrink-0 text-ink-soft transition-transform", open && "rotate-90")}
              aria-hidden
            />
          ) : (
            <span className="w-[15px]" aria-hidden />
          )}
        </div>
      </button>

      {hasDetail && open && (
        <div className="animate-fade-in border-t border-rule-soft bg-paper-raised px-3 py-3.5">
          <div className="max-w-[70ch] space-y-2.5">
            {row.detail!.prose.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-soft">
                {p}
              </p>
            ))}
          </div>

          {row.detail!.evidence && (
            <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap border border-rule bg-paper px-2.5 py-2 font-mono text-xs leading-relaxed text-ink-soft">
              {row.detail!.evidence.join("\n")}
            </pre>
          )}

          {row.detail!.waterfall && <Waterfall spec={row.detail!.waterfall} />}

          {row.detail!.actions && row.detail!.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.detail!.actions.map((action) => (
                <ActionButton key={action.label} action={action} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Ledger({
  rows,
  emptyState,
}: {
  rows: LedgerRowData[];
  emptyState?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-t-[1.5px] border-ink py-6">
        <p className="text-sm text-ink-soft">{emptyState ?? "Nothing to show for this period."}</p>
      </div>
    );
  }

  return (
    <div className="border-t-[1.5px] border-ink">
      {rows.map((row) => (
        <LedgerRow key={row.id} row={row} />
      ))}
    </div>
  );
}
