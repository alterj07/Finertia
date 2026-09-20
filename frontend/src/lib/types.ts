// Shared domain types for the Finertia frontend.
// These shapes are satisfied by the backend /api/dashboard/* endpoints;
// static config (nav, copilot prompts) lives in src/lib/config/*.

export type ActionTag = "auto" | "review" | "flag";

export type ModuleKey =
  | "command-center"
  | "financial-operations"
  | "graph"
  | "flight-simulator";

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
  href: string;
}

export interface RowAction {
  label: string;
  kind: "primary" | "secondary" | "ghost";
  href?: string;
}

export interface RowDetail {
  prose: string[];
  evidence?: string[];
  actions?: RowAction[];
  waterfall?: WaterfallSpec;
}

export interface LedgerRowData {
  id: string;
  tag?: ActionTag;
  primary: string;
  secondary?: string;
  amount?: string;
  meta?: string;
  href?: string;
  detail?: RowDetail;
}

export type ChecklistStatus = "done" | "in-progress" | "blocked" | "todo";

export interface ChecklistItemData {
  id: string;
  label: string;
  status: ChecklistStatus;
  owner: string;
}

export interface KpiCellData {
  label: string;
  value: string;
  delta?: string;
  favorable?: boolean;
}

export interface WaterfallBar {
  label: string;
  value: number;
  kind: "start" | "end" | "positive" | "negative";
}

export interface WaterfallSpec {
  unit?: string;
  bars: WaterfallBar[];
}

export interface FilterChipOption {
  id: string;
  label: string;
}

// ---- Data Graph -----------------------------------------------------

export type GraphGroup =
  | "agent"
  | "payables"
  | "receivables"
  | "reconciliation"
  | "close"
  | "forecast"
  | "audit";

export interface GraphNodeData {
  id: string;
  label: string;
  /** Raw reference (e.g. INV-7781, ****0042) shown in the detail panel. */
  ref?: string;
  group: GraphGroup;
  isAgent?: boolean;
  type: string;
  lastTouched: string;
  aggregate?: boolean;
  children?: string[];
  /** One-line description from the memory graph. */
  summary?: string;
  /** Selected properties of the underlying memory node. */
  props?: Record<string, string | number | boolean>;
}

export interface GraphEdgeData {
  source: string;
  target: string;
  /** Human-readable relationship phrase, e.g. "settles". */
  rel?: string;
}

export interface GraphDataset {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

/** Shape of GET /api/memory/graph/view: the live memory graph, aggregated. */
export interface GraphView extends GraphDataset {
  expansions: Record<string, GraphDataset>;
  stats: { documents: number; findings: number };
}

// ---- Copilot ----------------------------------------------------------

export interface Citation {
  label: string;
  href: string;
}

export interface CopilotMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  citations?: Citation[];
}

export interface ModuleCopilotScript {
  opening: string;
  openingCitations?: Citation[];
  suggestions: string[];
}
