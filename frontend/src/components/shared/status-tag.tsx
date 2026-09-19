import { cn } from "@/lib/utils";
import type { ActionTag } from "@/lib/types";

const TAG_LABEL: Record<ActionTag, string> = {
  auto: "auto",
  review: "review",
  flag: "flag",
};

const TAG_CLASS: Record<ActionTag, string> = {
  auto: "bg-green-soft text-green border-green/30",
  review: "bg-gold-soft text-gold border-gold/30",
  flag: "bg-rust-soft text-rust border-rust/30",
};

export function StatusTag({ tag, className }: { tag: ActionTag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-mono text-2xs leading-none tracking-normal",
        TAG_CLASS[tag],
        className,
      )}
    >
      {TAG_LABEL[tag]}
    </span>
  );
}
