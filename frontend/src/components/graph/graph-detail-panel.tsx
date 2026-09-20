import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchMemoryContext } from "@/lib/api";
import type { GraphNodeData } from "@/lib/types";

export function GraphDetailPanel({
  node,
  connections,
  onSelectConnection,
  onClose,
}: {
  node: GraphNodeData;
  connections: { id: string; label: string }[];
  onSelectConnection: (id: string) => void;
  onClose: () => void;
}) {
  // Context is keyed by node id so a stale pack never shows for a newly selected node.
  const [context, setContext] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (node.isAgent) return;
    let cancelled = false;
    fetchMemoryContext(node.id)
      .then((c) => {
        if (!cancelled) setContext({ id: node.id, text: c.text });
      })
      .catch(() => {
        /* the panel still renders without the context pack */
      });
    return () => {
      cancelled = true;
    };
  }, [node.id, node.isAgent]);
  const contextText = context?.id === node.id ? context.text : null;
  const propEntries = Object.entries(node.props ?? {}).slice(0, 8);
  return (
    <div className="absolute right-3 top-3 w-[280px] max-w-[calc(100%-24px)] border border-rule bg-paper-raised px-3.5 py-3.5 shadow-[0_4px_16px_rgba(var(--shadow-color),0.16)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-soft">
          {node.isAgent ? "Agent" : node.type}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close node detail"
          className="text-ink-soft hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      <h3 className="font-serif text-lg leading-tight text-ink">{node.label}</h3>
      {node.summary && (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{node.summary}</p>
      )}

      <dl className="mt-3 space-y-1.5 border-t border-rule-soft pt-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Type</dt>
          <dd className="text-ink">{node.type}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Last touched</dt>
          <dd className="font-mono text-ink">{node.lastTouched}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Connections</dt>
          <dd className="font-mono text-ink">{connections.length}</dd>
        </div>
        {propEntries.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="shrink-0 text-ink-soft">{k.replace(/_/g, " ")}</dt>
            <dd className="truncate text-right font-mono text-ink" title={String(v)}>
              {String(v)}
            </dd>
          </div>
        ))}
      </dl>

      {contextText && (
        <details className="mt-3 border-t border-rule-soft pt-3">
          <summary className="cursor-pointer text-2xs text-ink-soft">Memory context</summary>
          <pre className="scroll-thin mt-1.5 max-h-[160px] overflow-auto whitespace-pre-wrap font-mono text-2xs leading-relaxed text-ink">
            {contextText}
          </pre>
        </details>
      )}

      {connections.length > 0 && (
        <div className="mt-3 border-t border-rule-soft pt-3">
          <div className="mb-1.5 text-2xs text-ink-soft">Connected to</div>
          <ul className="scroll-thin max-h-[180px] space-y-0.5 overflow-y-auto">
            {connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectConnection(c.id)}
                  className="block w-full truncate rounded-sm px-1.5 py-1 text-left text-xs text-ink hover:bg-paper"
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
