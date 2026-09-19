import Link from "next/link";
import type { ReactNode } from "react";

export function SectionBlock({
  title,
  action,
  headerRight,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-ink">{title}</h2>
        <div className="flex items-center gap-3">
          {headerRight}
          {action && (
            <Link href={action.href} className="text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
              {action.label}
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
