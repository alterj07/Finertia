import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusTag } from "@/components/shared/status-tag";
import { PAYABLES_APPROVAL_QUEUE } from "@/lib/mock/payables";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = PAYABLES_APPROVAL_QUEUE.find((r) => r.id === `inv-${id}`);

  if (!row) notFound();

  return (
    <div>
      <Link href="/payables" className="text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
        ← Back to Payables
      </Link>

      <div className="mt-4 flex items-start gap-3">
        {row.tag && <StatusTag tag={row.tag} className="mt-1" />}
        <div>
          <h1 className="font-serif text-2xl leading-tight text-ink">{row.primary}</h1>
          {row.secondary && <p className="mt-1 text-sm text-ink-soft">{row.secondary}</p>}
        </div>
      </div>

      {row.amount && <p className="mt-4 font-mono text-lg text-ink">{row.amount}</p>}

      {row.detail && (
        <div className="mt-6 max-w-[70ch] border-t border-rule pt-5">
          <div className="space-y-2.5">
            {row.detail.prose.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-soft">
                {p}
              </p>
            ))}
          </div>

          {row.detail.evidence && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-rule bg-paper-raised px-2.5 py-2 font-mono text-xs leading-relaxed text-ink-soft">
              {row.detail.evidence.join("\n")}
            </pre>
          )}

          {row.detail.actions && (
            <div className="mt-4 flex flex-wrap gap-2">
              {row.detail.actions
                .filter((a) => a.label !== "Open full invoice")
                .map((action) =>
                  action.href ? (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="inline-flex items-center rounded-sm border border-rule px-2.5 py-1 text-xs text-ink hover:border-ink-soft"
                    >
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      key={action.label}
                      type="button"
                      className={
                        action.kind === "primary"
                          ? "inline-flex items-center rounded-sm border border-ink bg-ink px-2.5 py-1 text-xs text-paper hover:bg-ink/85"
                          : "inline-flex items-center rounded-sm border border-rule px-2.5 py-1 text-xs text-ink hover:border-ink-soft"
                      }
                    >
                      {action.label}
                    </button>
                  ),
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
