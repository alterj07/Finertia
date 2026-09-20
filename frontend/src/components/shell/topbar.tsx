"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, MessageSquare, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODULE_TITLES } from "@/lib/config/nav";
import { pathToModule } from "@/lib/route";
import { ENTITIES, PERIODS, useAppStore } from "@/store/app-store";

const AS_OF = "As of 2026-03-31";

function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

function PickerDropdown({
  value,
  options,
  onChange,
  mono,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-1 text-ink-soft hover:border-rule hover:text-ink",
          mono ? "font-mono text-sm" : "text-sm",
        )}
      >
        {value}
        <span className="text-2xs" aria-hidden>▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-30 mt-1 w-max min-w-[180px] border border-rule bg-paper-raised py-1 shadow-[0_2px_10px_rgba(var(--shadow-color),0.12)]"
        >
          {options.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={opt === value}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-sm hover:bg-paper",
                  mono && "font-mono",
                  opt === value ? "text-ink" : "text-ink-soft",
                )}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const moduleKey = pathToModule(pathname);
  const entity = useAppStore((s) => s.entity);
  const setEntity = useAppStore((s) => s.setEntity);
  const period = useAppStore((s) => s.period);
  const setPeriod = useAppStore((s) => s.setPeriod);
  const isDark = useAppStore((s) => s.isDark);
  const toggleDark = useAppStore((s) => s.toggleDark);
  const setLeftRailOpen = useAppStore((s) => s.setLeftRailOpen);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);

  return (
    <header
      className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-rule bg-paper px-4 py-3 sm:px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setLeftRailOpen(true)}
          className="text-ink-soft hover:text-ink min-[880px]:hidden"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate font-serif text-xl text-ink">{MODULE_TITLES[moduleKey]}</h1>
          <span className="hidden shrink-0 text-sm text-ink-soft sm:inline">{AS_OF}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <div className="hidden md:block">
          <PickerDropdown value={entity} options={ENTITIES} onChange={setEntity} />
        </div>
        <div className="hidden sm:block">
          <PickerDropdown value={period} options={PERIODS} onChange={setPeriod} mono />
        </div>
        <button
          type="button"
          onClick={toggleDark}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="rounded-sm p-1.5 text-ink-soft hover:bg-paper-raised hover:text-ink"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setCopilotOpen(true)}
          className="rounded-sm p-1.5 text-ink-soft hover:bg-paper-raised hover:text-ink min-[880px]:hidden"
          aria-label="Open Ask Finertia"
        >
          <MessageSquare size={18} />
        </button>
      </div>
    </header>
  );
}
