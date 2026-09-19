import { cn } from "@/lib/utils";

export function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={cn(
        "inline-flex items-center gap-1 rounded-chip border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-transparent text-ink-soft hover:border-ink-soft hover:text-ink",
      )}
    >
      {label}
      {typeof count === "number" && (
        <span className={cn("font-mono text-2xs", active ? "text-paper/70" : "text-ink-soft/70")}>
          {count}
        </span>
      )}
    </button>
  );
}
