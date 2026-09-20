"use client";

import { usePathname } from "next/navigation";
import { Menu, MessageSquare } from "lucide-react";
import { MODULE_TITLES } from "@/lib/config/nav";
import { pathToModule } from "@/lib/route";
import { useAppStore } from "@/store/app-store";

export function Topbar() {
  const pathname = usePathname();
  const moduleKey = pathToModule(pathname);
  const setLeftRailOpen = useAppStore((s) => s.setLeftRailOpen);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);

  return (
    <header
      className="sticky top-0 z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-rule bg-paper px-4 py-3 sm:px-6"
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
      </div>

      <h1 className="truncate text-center font-serif text-[32px] text-ink">{MODULE_TITLES[moduleKey]}</h1>

      <div className="flex items-center justify-end gap-1 sm:gap-2">
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
