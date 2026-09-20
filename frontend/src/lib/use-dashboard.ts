"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getDashboard } from "@/lib/api";

export interface DashboardState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface FetchResult<T> {
  tick: number;
  data?: T;
  error?: string;
}

/** Fetch a dashboard payload from the backend on mount; `reload()` refetches. */
export function useDashboard<T>(screen: string): DashboardState<T> {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<FetchResult<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const at = tick;
    getDashboard<T>(screen)
      .then((d) => {
        if (!cancelled) setRes({ tick: at, data: d });
      })
      .catch((err) => {
        if (!cancelled)
          setRes({
            tick: at,
            error: err instanceof ApiError ? err.message : "Request failed",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [screen, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const fresh = res !== null && res.tick === tick;
  return {
    data: fresh ? (res.data ?? null) : null,
    loading: !fresh,
    error: fresh ? (res.error ?? null) : null,
    reload,
  };
}
