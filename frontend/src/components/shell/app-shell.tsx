"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LeftRail } from "@/components/shell/left-rail";
import { Topbar } from "@/components/shell/topbar";
import { CopilotRail } from "@/components/shell/copilot-rail";
import { pathToModule } from "@/lib/route";
import { useCopilotStore } from "@/store/copilot-store";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const setActiveModule = useCopilotStore((s) => s.setActiveModule);

  useEffect(() => {
    setActiveModule(pathToModule(pathname));
  }, [pathname, setActiveModule]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-paper text-ink">
      <LeftRail />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="scroll-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[920px] px-4 py-6 sm:px-8 sm:py-8">{children}</div>
        </main>
      </div>
      <CopilotRail />
    </div>
  );
}
