import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionTag } from "@/lib/types";

const TAG_LABEL: Record<ActionTag, string> = {
  auto: "auto",
  review: "review",
  flag: "flag",
};

// A small solid-colored dot reads as a status indicator without the
// translucent-chip look; plain text keeps the row scannable.
const TAG_COLOR: Record<ActionTag, string> = {
  auto: "text-green",
  review: "text-gold",
  flag: "text-rust",
};

export function StatusTag({ tag, className }: { tag: ActionTag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs leading-none tracking-normal text-ink-soft",
        className,
      )}
    >
      <Circle size={8} className={TAG_COLOR[tag]} fill="currentColor" stroke="none" aria-hidden />
      {TAG_LABEL[tag]}
    </span>
  );
}
