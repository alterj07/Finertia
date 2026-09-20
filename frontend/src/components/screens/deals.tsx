"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { fetchDeals, type DealItem, type DealsResponse } from "@/lib/api";
import { SectionBlock } from "@/components/shared/section-block";
import { cn } from "@/lib/utils";

const STAGE_CLASS: Record<string, string> = {
  "New inbound": "bg-green-soft text-green border-green/30",
  Expansion: "bg-gold-soft text-gold border-gold/30",
  Renewal: "bg-gold-soft text-gold border-gold/30",
  RFQ: "bg-green-soft text-green border-green/30",
  "Not a deal": "bg-transparent text-ink-soft border-rule",
};

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function DealsScreen() {
  const [data, setData] = useState<DealsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    fetchDeals()
      .then((d) => {
        setData(d);
        setError(null);
        setSelected((s) => s ?? d.items.find((i) => i.is_deal)?.email ?? null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "failed to load"))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => showAll || i.is_deal),
    [data, showAll],
  );
  const current: DealItem | undefined = data?.items.find((i) => i.email === selected);

  async function copyDraft() {
    if (!current?.draft) return;
    const text = `To: ${current.draft.to}\nSubject: ${current.draft.subject}\n\n${current.draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  }

  return (
    <div className="stagger">
      <SectionBlock
        title="Deals"
        headerRight={
          data && (
            <span className="font-mono text-sm text-ink-soft">
              {data.deals} deals · pipeline est. {money(data.pipeline_estimate)}
            </span>
          )
        }
      >
        <p className="mb-4 max-w-[70ch] text-sm leading-relaxed text-ink-soft">
          The Deals agent reads every email in the inbox, decides whether it is a sales
          opportunity, sizes it, checks the sender&apos;s payment record in shared memory, and
          drafts a reply. Nothing is sent from here: copy the draft and send it yourself.
        </p>
        <div className="mb-3 flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-ink-soft">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show emails the agent ruled out
          </label>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load();
            }}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 text-ink-soft hover:text-ink disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(loading && "animate-spin")} /> Re-run agent
          </button>
        </div>

        {error && <p className="text-sm text-rust">Could not load deals: {error}</p>}

        <div className="grid gap-4 md:grid-cols-[minmax(260px,1fr)_minmax(0,1.4fr)]">
          <ul className="scroll-thin max-h-[640px] divide-y divide-rule-soft overflow-y-auto border border-rule bg-paper-raised">
            {items.map((i) => (
              <li key={i.email}>
                <button
                  type="button"
                  onClick={() => setSelected(i.email)}
                  className={cn(
                    "block w-full px-3.5 py-3 text-left transition-colors hover:bg-paper",
                    selected === i.email && "bg-paper",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm text-ink">{i.subject}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-2xs",
                        STAGE_CLASS[i.stage] ?? STAGE_CLASS["Not a deal"],
                      )}
                    >
                      {i.stage}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
                    <span className="truncate">{i.sender.split("<")[0].trim()}</span>
                    <span className="font-mono">{i.date}</span>
                    {i.is_deal && <span className="ml-auto font-mono text-ink">{money(i.value_estimate)}</span>}
                  </div>
                  {i.credit_risk && (
                    <div className="mt-1 text-2xs text-rust">Credit risk: {i.credit_risk}</div>
                  )}
                </button>
              </li>
            ))}
            {!items.length && !error && (
              <li className="px-3.5 py-6 text-center text-sm text-ink-soft">
                {loading ? "Running the Deals agent…" : "No emails."}
              </li>
            )}
          </ul>

          <div className="border border-rule bg-paper-raised">
            {current ? (
              <div className="flex flex-col">
                <div className="border-b border-rule-soft px-4 py-3">
                  <div className="font-mono text-2xs uppercase tracking-wide text-ink-soft">Original email</div>
                  <div className="mt-1 text-xs text-ink-soft">{current.sender}</div>
                  <pre className="scroll-thin mt-2 max-h-[160px] overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink">
                    {current.body}
                  </pre>
                </div>
                {current.draft ? (
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-2xs uppercase tracking-wide text-ink-soft">
                        Suggested reply{current.draft.polished ? " · polished by LLM" : " · template from memory"}
                      </div>
                      <button
                        type="button"
                        onClick={copyDraft}
                        className="inline-flex items-center gap-1 rounded-chip border border-rule px-2.5 py-1 text-xs text-ink hover:border-ink-soft hover:bg-paper"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? "Copied" : "Copy draft"}
                      </button>
                    </div>
                    <dl className="mt-2 space-y-0.5 text-xs">
                      <div className="flex gap-2"><dt className="w-14 text-ink-soft">To</dt><dd className="font-mono text-ink">{current.draft.to}</dd></div>
                      <div className="flex gap-2"><dt className="w-14 text-ink-soft">Subject</dt><dd className="text-ink">{current.draft.subject}</dd></div>
                    </dl>
                    <pre className="scroll-thin mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-rule-soft pt-3 font-sans text-sm leading-relaxed text-ink">
                      {current.draft.body}
                    </pre>
                    {current.evidence.length > 0 && (
                      <div className="mt-3 border-t border-rule-soft pt-2 text-2xs text-ink-soft">
                        Grounded in: {current.evidence.join(", ")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-ink-soft">No reply drafted: the agent ruled this out as a deal.</div>
                )}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-ink-soft">Select an email.</div>
            )}
          </div>
        </div>
      </SectionBlock>
    </div>
  );
}
