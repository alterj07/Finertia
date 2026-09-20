import { clearToken, getToken } from "@/lib/auth-token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    let body: unknown;
    try {
      body = await res.json();
      if ((body as { detail?: string })?.detail)
        detail = (body as { detail: string }).detail;
    } catch {
      /* keep default */
    }
    if (
      res.status === 401 &&
      !path.startsWith("/api/auth/") &&
      typeof window !== "undefined"
    ) {
      clearToken();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
      );
    }
    throw new ApiError(res.status, detail, body);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
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
  labels: Record<string, string>;
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

export async function deleteChatSession(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat/sessions/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
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

export interface AgentStatus {
  state: "idle" | "skipped" | "running" | "done" | "failed";
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  agents: string[];
}

export function getAgentStatus(): Promise<AgentStatus> {
  return apiFetch<AgentStatus>("/api/orchestrator/status");
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
  Deals: "/api/agents/deals/run",
  "Audit & Controls": "/api/agents/audit/run",
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

// ---- deals ----

export interface DealDraft {
  to: string;
  subject: string;
  body: string;
  polished?: string;
}

export interface DealHistory {
  invoices: number;
  lifetime_billed: number;
  open_ar: number;
  overdue_count: number;
  overdue_amount: number;
  paid_on_time: number;
  notes: string[];
}

export interface DealItem {
  email: string;
  subject: string;
  sender: string;
  date: string;
  is_deal: boolean;
  stage: string;
  score: number;
  reason: string;
  party_id: string | null;
  body: string;
  finding_id: string | null;
  value_estimate: number | null;
  credit_risk: string | null;
  history: DealHistory | null;
  draft: DealDraft | null;
  evidence: string[];
}

export interface DealsResponse {
  as_of: string;
  pipeline_estimate: number;
  deals: number;
  items: DealItem[];
}

export function fetchDeals(): Promise<DealsResponse> {
  return apiFetch<DealsResponse>("/api/deals");
}

// ---- data uploads ----

export type UploadKind = "bank" | "gl" | "invoices" | "emails" | "ignored";

export interface UploadFileReport {
  name: string;
  kind: UploadKind | null; // null = incompatible
  rows: number;
  ok: boolean;
  error: string | null;
}

export interface UploadReport {
  files: UploadFileReport[];
  ok: boolean;
  counts: Record<string, number>;
}

export interface UploadResult {
  report: UploadReport;
  added: Record<string, number>;
  backend: string;
  memory: MemoryStats;
}

export interface UploadFileInput {
  file: File;
  path: string; // relative path, keeps folder structure for the backend
}

function uploadFormData(files: UploadFileInput[]): FormData {
  const fd = new FormData();
  for (const { file, path } of files) fd.append("files", file, path);
  return fd;
}

export function validateUpload(files: UploadFileInput[]): Promise<UploadReport> {
  return apiFetch<UploadReport>("/api/uploads/validate", {
    method: "POST",
    body: uploadFormData(files),
  });
}

export function uploadData(files: UploadFileInput[]): Promise<UploadResult> {
  return apiFetch<UploadResult>("/api/uploads", {
    method: "POST",
    body: uploadFormData(files),
  });
}

// ---- auth ----

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
  role: "admin" | "member";
}

export interface AuthTokenResponse {
  token: string;
  user: AuthUser;
}

export function authLogin(
  identifier: string,
  password: string,
): Promise<AuthTokenResponse> {
  return apiFetch<AuthTokenResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
}

export function authSignup(
  email: string,
  password: string,
  name: string,
): Promise<AuthTokenResponse> {
  return apiFetch<AuthTokenResponse>("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
}

export function authMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me");
}
