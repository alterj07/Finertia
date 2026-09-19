import { X } from "lucide-react";
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
  return (
    <div className="absolute right-3 top-3 w-[240px] max-w-[calc(100%-24px)] border border-rule bg-paper-raised px-3.5 py-3.5 shadow-[0_4px_16px_rgba(var(--shadow-color),0.16)]">
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
      </dl>

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
