"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionBlock } from "@/components/shared/section-block";
import { ACTIVITY_LOG, EXAMPLE_QA } from "@/lib/mock/audit";

export function AuditScreen() {
  const [query, setQuery] = useState("");

  return (
    <div>
      <SectionBlock title="Ask about any number">
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mb-4 flex items-center gap-2 border border-rule bg-paper-raised px-3 py-2"
        >
          <Search size={14} className="shrink-0 text-ink-soft" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question — it will be logged permanently below"
            aria-label="Ask about any number"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
          />
        </form>

        <div className="border-t-[1.5px] border-ink">
          <div className="border-b border-rule-soft px-1 py-3">
            <div className="text-sm text-ink">{EXAMPLE_QA.primary}</div>
            {EXAMPLE_QA.secondary && (
              <div className="mt-0.5 text-xs text-ink-soft">{EXAMPLE_QA.secondary}</div>
            )}
            <div className="mt-3 max-w-[70ch] space-y-2.5 border-t border-rule-soft pt-3">
              {EXAMPLE_QA.detail!.prose.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-ink-soft">
                  {p}
                </p>
              ))}
            </div>
            {EXAMPLE_QA.detail!.evidence && (
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-rule bg-paper px-2.5 py-2 font-mono text-xs leading-relaxed text-ink-soft">
                {EXAMPLE_QA.detail!.evidence.join("\n")}
              </pre>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_QA.detail!.actions!.map((action) =>
                action.href ? (
                  <Link
                    key={action.label}
                    href={action.href}
                    className={cn(
                      "inline-flex items-center rounded-sm border px-2.5 py-1 text-xs",
                      action.kind === "primary"
                        ? "border-ink bg-ink text-paper hover:bg-ink/85"
                        : "border-rule text-ink hover:border-ink-soft",
                    )}
                  >
                    {action.label}
                  </Link>
                ) : (
                  <button
                    key={action.label}
                    type="button"
                    className="inline-flex items-center rounded-sm border border-rule px-2.5 py-1 text-xs text-ink hover:border-ink-soft"
                  >
                    {action.label}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        title="Immutable activity log"
        headerRight={
          <button type="button" className="text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
            Export log
          </button>
        }
      >
        <div className="border-t-[1.5px] border-ink">
          {ACTIVITY_LOG.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-1 border-b border-rule-soft py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="w-[172px] shrink-0 font-mono text-xs text-ink-soft">{entry.timestamp}</span>
              <span
                className={cn(
                  "w-[60px] shrink-0 font-mono text-2xs uppercase",
                  entry.actor === "system" ? "text-blue" : "text-ink",
                )}
              >
                {entry.actor}
              </span>
              <span className="flex-1 text-sm text-ink">
                {entry.action}
                <span className="text-ink-soft"> — {entry.actorName}</span>
              </span>
              {entry.amount && <span className="font-mono text-sm text-ink">{entry.amount}</span>}
            </div>
          ))}
        </div>
      </SectionBlock>
    </div>
  );
}
