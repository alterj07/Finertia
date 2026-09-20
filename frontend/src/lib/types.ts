// Shared domain types for the Finertia frontend.
// All data implementing these types is mocked/seeded — see src/lib/mock/*.
// The shape here is what a real backend/connector would need to satisfy.

export type AutonomyLevel = "auto" | "assisted" | "manual";

export type ActionTag = "auto" | "review" | "flag";

export type ModuleKey =
  | "command-center"
  | "payables"
  | "receivables"
  | "reconciliation"
  | "close"
  | "forecast"
  | "audit"
  | "graph";

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
  href: string;
}

export interface AutonomyWorkflow {
  id: string;
  workflow: string;
  module: ModuleKey;
  level: AutonomyLevel;
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
  answers: Record<string, { text: string; citations?: Citation[] }>;
}
