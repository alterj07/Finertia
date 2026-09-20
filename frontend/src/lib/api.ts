const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

import type { GraphView } from "@/lib/types";

export function fetchGraphView(): Promise<GraphView> {
  return apiFetch<GraphView>("/api/memory/graph/view");
}

export interface MemoryContext {
  focus: { id: string; type: string } | null;
  text: string;
}

export function fetchMemoryContext(id: string, depth = 1): Promise<MemoryContext> {
  return apiFetch<MemoryContext>(
    `/api/memory/context?id=${encodeURIComponent(id)}&depth=${depth}&max_nodes=40`,
  );
}
