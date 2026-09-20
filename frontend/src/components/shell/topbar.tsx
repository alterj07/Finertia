"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, MessageSquare } from "lucide-react";
import { MODULE_TITLES } from "@/lib/config/nav";
import { pathToModule } from "@/lib/route";
import { useAppStore } from "@/store/app-store";
import { useAuthStore } from "@/store/auth-store";

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

function UserChip() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));

  if (!user) return null;
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-ink font-mono text-2xs text-paper"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-max min-w-[180px] border border-rule bg-paper-raised py-1 shadow-[0_2px_10px_rgba(var(--shadow-color),0.12)]">
          <div className="px-3 py-1.5">
            <div className="text-sm text-ink">{user.name || user.username}</div>
            <div className="text-2xs text-ink-soft">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-ink-soft hover:bg-paper hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

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
        <UserChip />
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
