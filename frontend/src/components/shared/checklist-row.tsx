import { cn } from "@/lib/utils";
import type { ChecklistItemData } from "@/lib/types";

const STATUS_CONFIG: Record<
  ChecklistItemData["status"],
  { glyph: string; className: string; label: string }
> = {
  done: { glyph: "✓", className: "bg-green border-green text-paper", label: "Done" },
  "in-progress": { glyph: "···", className: "bg-gold border-gold text-paper", label: "In progress" },
  blocked: { glyph: "!", className: "bg-rust border-rust text-paper", label: "Blocked" },
  todo: { glyph: "", className: "bg-transparent border-rule text-transparent", label: "To do" },
};

export function ChecklistRow({ item }: { item: ChecklistItemData }) {
  const status = STATUS_CONFIG[item.status];
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft py-2.5 last:border-b-0">
      <span
        role="img"
        aria-label={status.label}
        title={status.label}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] leading-none",
          status.className,
        )}
      >
        {status.glyph}
      </span>
      <span className="flex-1 text-sm text-ink">{item.label}</span>
      <span className="font-mono text-xs text-ink-soft">{item.owner}</span>
    </div>
  );
}
