const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---- chat ----

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls: ToolCall[];
  tool_call_id: string | null;
  name: string | null;
  created_at: string;
}

export interface ToolEvent {
  name: string;
  arguments: Record<string, unknown>;
  result_preview: string;
  citations: string[];
}

export interface ChatResponse {
  session_id: string;
  message: ChatMessage;
  tool_events: ToolEvent[];
  citations: string[];
}

export interface SessionSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface GraphNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface GraphEdge {
  src: string;
  rel: string;
  dst: string;
  agent: string;
  props: Record<string, unknown>;
}

export interface NodeDetail {
  node: GraphNode;
  out: GraphEdge[];
  in: GraphEdge[];
}

export interface MemoryStats {
  nodes: number;
  edges: number;
  findings: number;
  node_types: Record<string, number>;
  edge_types: Record<string, number>;
}

const post = (path: string, body: unknown) =>
  apiFetch<ChatResponse>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export function sendChat(
  sessionId: string | null,
  message: string,
  context?: string,
) {
  return post("/api/chat", { session_id: sessionId, message, context });
}

export function listSessions() {
  return apiFetch<SessionSummary[]>("/api/chat/sessions");
}

export function getSession(id: string) {
  return apiFetch<Session>(`/api/chat/sessions/${id}`);
}

export function getNode(id: string) {
  return apiFetch<NodeDetail>(`/api/memory/node?id=${encodeURIComponent(id)}`);
}

export function getMemoryStats() {
  return apiFetch<MemoryStats>("/api/memory/stats");
}

// ---- memory graph view (command center) ----

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

// ---- dashboards ----

export function getDashboard<T>(screen: string): Promise<T> {
  return apiFetch<T>(`/api/dashboard/${screen}`);
}

export function getPayableInvoice(key: string): Promise<PayableInvoiceDetail> {
  return apiFetch<PayableInvoiceDetail>(
    `/api/dashboard/payables/invoices/${encodeURIComponent(key)}`,
  );
}

export interface PayableInvoiceDetail {
  row: import("@/lib/types").LedgerRowData;
  finding: Record<string, unknown>;
}

export function runOrchestrator(
  request: string,
): Promise<{ results: AgentRunResult[] }> {
  return apiFetch("/api/orchestrator/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request }),
  });
}

// ---- agents ----

export interface AgentSpec {
  name: string;
  description: string;
  capabilities: string[];
  params: Record<string, unknown>;
}

export interface AgentRunResult {
  summary: Record<string, unknown>;
  findings: { code: string; key: string; title: string; severity: string }[];
}

/** Dedicated run endpoints per registered agent. */
const AGENT_ROUTES: Record<string, string> = {
  "Cash & Reconciliation": "/api/agents/recon/run",
  "AP/AR": "/api/agents/apar/run",
};

export function listAgents(): Promise<AgentSpec[]> {
  return apiFetch<AgentSpec[]>("/api/agents");
}

export function runAgent(name: string, params: Record<string, unknown> = {}): Promise<AgentRunResult> {
  const route = AGENT_ROUTES[name];
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
  };
  if (route) {
    return apiFetch<AgentRunResult>(route, { ...init, body: JSON.stringify(params) });
  }
  // Unknown agent: ask the orchestrator by name and unwrap its first result.
  return apiFetch<{ results: AgentRunResult[] }>("/api/orchestrator/run", {
    ...init,
    body: JSON.stringify({ request: name, defaults: params }),
  }).then((r) => r.results[0] ?? { summary: {}, findings: [] });
}
