"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentStatus, getAgentStatus } from "@/lib/api";

/** Polls the agent warm-up status. Calls `onDone` once when a transition to
 * done/failed is observed after the agent run was seen running. */
export function useAgentStatus(onDone?: () => void) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const sawRunning = useRef(false);
  const fired = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const refresh = useCallback(async () => {
    try {
      const s = await getAgentStatus();
      setStatus(s);
      if (s.state === "running") sawRunning.current = true;
      if (
        sawRunning.current &&
        !fired.current &&
        (s.state === "done" || s.state === "failed")
      ) {
        fired.current = true;
        onDoneRef.current?.();
      }
    } catch {
      // status endpoint unavailable — leave last state
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      await refresh();
      if (!cancelled && sawRunning.current && !fired.current) {
        timer = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  return { status, refresh };
}
