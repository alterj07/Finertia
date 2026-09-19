"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/mock/nav";
import { AUTONOMY_WORKFLOWS } from "@/lib/mock/autonomy";
import { useAppStore } from "@/store/app-store";
import { pathToModule } from "@/lib/route";

const LEVEL_LABEL: Record<string, string> = {
  auto: "Auto",
  assisted: "Assisted",
  manual: "Manual",
};

const LEVEL_CLASS: Record<string, string> = {
  auto: "text-green",
  assisted: "text-gold",
  manual: "text-ink-soft",
};

export function LeftRail() {
  const pathname = usePathname();
  const activeModule = pathToModule(pathname);
  const leftRailOpen = useAppStore((s) => s.leftRailOpen);
  const setLeftRailOpen = useAppStore((s) => s.setLeftRailOpen);

  return (
    <>
      {leftRailOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 min-[880px]:hidden"
          onClick={() => setLeftRailOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] shrink-0 flex-col bg-[var(--rail-bg)] transition-transform duration-200 min-[880px]:static min-[880px]:z-auto min-[880px]:w-[220px] min-[880px]:translate-x-0",
          leftRailOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-start justify-between px-5 pt-6 pb-5">
          <div>
            <div className="font-serif text-[19px] leading-none text-paper">Finertia</div>
            <div className="mt-1.5 text-xs text-white/45">Agentic Finance OS</div>
          </div>
          <button
            type="button"
            onClick={() => setLeftRailOpen(false)}
            className="text-white/50 hover:text-white min-[880px]:hidden"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto px-2.5" aria-label="Modules">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = item.key === activeModule;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => setLeftRailOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-sm border-l-2 border-transparent px-2.5 py-2 text-sm text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white",
                      active && "border-green bg-white/[0.06] text-white",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        item.needsAttention ? "bg-gold" : "bg-white/25",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {typeof item.count === "number" && (
                      <span className="font-mono text-2xs text-white/50">{item.count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/10 px-4 py-4">
          <div className="mb-2 text-2xs text-white/45">Autonomy</div>
          <ul className="flex flex-col gap-1.5">
            {AUTONOMY_WORKFLOWS.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-white/65">{w.workflow}</span>
                <span className={cn("shrink-0 font-mono text-2xs", LEVEL_CLASS[w.level])}>
                  {LEVEL_LABEL[w.level]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
