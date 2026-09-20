"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/config/nav";
import { AUTONOMY_WORKFLOWS } from "@/lib/config/autonomy";
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

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Desktop-only expansion driver; below 880px the rail is a translated drawer.
  const expanded = hovered || focused || leftRailOpen;

  const fade = cn(
    "whitespace-nowrap transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
    expanded
      ? "opacity-100 translate-x-0 delay-75"
      : "opacity-0 -translate-x-1 pointer-events-none",
  );

  return (
    <>
      {leftRailOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 min-[880px]:hidden"
          onClick={() => setLeftRailOpen(false)}
          aria-hidden
        />
      )}
      {/* In-flow spacer reserves the collapsed width on desktop so content
       * never reflows; the aside overlays it when expanded. */}
      <div className="hidden w-16 shrink-0 min-[880px]:block" aria-hidden />
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFocused(false);
          }
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[240px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-[var(--rail-bg)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none min-[880px]:translate-x-0",
          expanded ? "min-[880px]:w-60" : "min-[880px]:w-16",
          leftRailOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 px-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>
            <span className="font-serif text-[19px] leading-none text-white">F</span>
          </span>
          <div className={fade}>
            <div className="font-serif text-[19px] leading-none text-white">Finertia</div>
            <div className="mt-1.5 text-xs text-white/45">Agentic Finance OS</div>
          </div>
          <button
            type="button"
            onClick={() => setLeftRailOpen(false)}
            className="ml-auto text-white/50 hover:text-white min-[880px]:hidden"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden px-3" aria-label="Modules">
          <ul className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = item.key === activeModule;
              const Icon = item.icon;
              return (
                <li key={item.key} className="relative">
                  {active && (
                    <span
                      className="absolute top-2 bottom-2 left-0 w-0.5 rounded-r bg-green"
                      aria-hidden
                    />
                  )}
                  <Link
                    href={item.href}
                    title={item.label}
                    onClick={(e) => {
                      setLeftRailOpen(false);
                      e.currentTarget.blur();
                    }}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-md text-sm text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white",
                      active && "bg-white/[0.08] text-white",
                    )}
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                      <Icon size={18} aria-hidden />
                      {item.needsAttention && (
                        <span
                          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-gold"
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className={cn("flex flex-1 items-center gap-2", fade)}>
                      <span className="flex-1 truncate">{item.label}</span>
                      {typeof item.count === "number" && (
                        <span className="font-mono text-2xs text-white/50">{item.count}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/10 px-3 py-4">
          <div className={fade}>
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
        </div>
      </aside>
    </>
  );
}
