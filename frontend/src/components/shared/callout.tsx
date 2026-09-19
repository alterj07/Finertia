import type { ReactNode } from "react";

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-2 border-green py-0.5 pl-3 text-sm leading-relaxed text-ink-soft">
      {children}
    </div>
  );
}
