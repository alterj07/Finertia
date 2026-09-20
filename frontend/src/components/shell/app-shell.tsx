"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LeftRail } from "@/components/shell/left-rail";
import { Topbar } from "@/components/shell/topbar";
import { CopilotRail } from "@/components/shell/copilot-rail";
import { getToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import { pathToModule } from "@/lib/route";
import { useAuthStore } from "@/store/auth-store";
import { useCopilotStore } from "@/store/copilot-store";

const AUTH_PATHS = new Set(["/login", "/signup"]);

function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const refresh = useAuthStore((s) => s.refresh);
  const refreshedRef = useRef(false);

  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (hydrated && !getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, pathname, router]);

  useEffect(() => {
    if (hydrated && getToken() && !user && !refreshedRef.current) {
      refreshedRef.current = true;
      void refresh();
    }
  }, [hydrated, user, refresh]);

  if (!hydrated || !getToken()) return null;
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const moduleKey = pathToModule(pathname);
  const setActiveModule = useCopilotStore((s) => s.setActiveModule);

  useEffect(() => {
    setActiveModule(moduleKey);
  }, [moduleKey, setActiveModule]);

  if (AUTH_PATHS.has(pathname)) {
    return (
      <div className="h-full w-full overflow-y-auto bg-paper text-ink">
        {children}
      </div>
    );
  }

  return (
    <AuthGate>
      <div className="flex h-full w-full overflow-hidden bg-paper text-ink">
        <LeftRail />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="scroll-thin flex-1 overflow-y-auto">
            <div
              className={cn(
                "mx-auto w-full px-4 py-6 sm:px-8 sm:py-8",
                // The graph needs real width to lay out its nodes — every
                // other screen keeps the narrower reading-width column.
                moduleKey === "graph" ? "max-w-[1400px]" : "max-w-[920px]",
              )}
            >
              {children}
            </div>
          </main>
        </div>
        <CopilotRail />
      </div>
    </AuthGate>
  );
}
