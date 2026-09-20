"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getDashboard } from "@/lib/api";

export interface DashboardState<T> {
  data: T | null;
  loading: boolean;
  /** A reload is in flight but the previous data is still shown — lets a
   * screen stay on-screen and responsive instead of flashing back to a
   * blocking spinner every time an agent run or upload refreshes it. */
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

/** Fetch a dashboard payload from the backend on mount; `reload()` refetches
 * in the background without discarding what's already rendered. */
export function useDashboard<T>(screen: string): DashboardState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [screenSeen, setScreenSeen] = useState(screen);
  const fetchIdRef = useRef(0);

  const load = useCallback(
    (isReload: boolean) => {
      const id = (fetchIdRef.current += 1);
      if (isReload) setRefreshing(true);
      else setLoading(true);
      getDashboard<T>(screen)
        .then((d) => {
          if (fetchIdRef.current !== id) return;
          setData(d);
          setError(null);
        })
        .catch((err) => {
          if (fetchIdRef.current !== id) return;
          setError(err instanceof ApiError ? err.message : "Request failed");
        })
        .finally(() => {
          if (fetchIdRef.current !== id) return;
          setLoading(false);
          setRefreshing(false);
        });
    },
    [screen],
  );

  // Reset when `screen` itself changes (every call site uses a fixed
  // literal, but keep the hook correct) — adjusted during render, per
  // React's pattern for resetting state on a prop change, rather than an
  // effect that calls setState synchronously.
  if (screenSeen !== screen) {
    setScreenSeen(screen);
    setData(null);
    setError(null);
    setLoading(true);
  }

  useEffect(() => {
    // Deferred one tick so the setState calls `load` makes land outside the
    // effect's own call stack.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) load(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const reload = useCallback(() => load(true), [load]);

  return { data, loading, refreshing, error, reload };
}
