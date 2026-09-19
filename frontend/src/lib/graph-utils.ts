import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import type { GraphEdgeData, GraphGroup, GraphNodeData } from "@/lib/types";

export interface SimNode extends GraphNodeData, SimulationNodeDatum {}
export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export const GROUP_COLOR: Record<GraphGroup, string> = {
  agent: "var(--ink)",
  payables: "var(--green)",
  receivables: "var(--gold)",
  reconciliation: "var(--blue)",
  close: "var(--ink-soft)",
  forecast: "var(--forecast)",
  audit: "var(--rust)",
};

export const GROUP_LABEL: Record<GraphGroup, string> = {
  agent: "Agents",
  payables: "Payables",
  receivables: "Receivables",
  reconciliation: "Reconciliation",
  close: "Close",
  forecast: "Forecast",
  audit: "Audit",
};

export const MODULE_GROUPS: GraphGroup[] = [
  "payables",
  "receivables",
  "reconciliation",
  "close",
  "forecast",
  "audit",
];

export function nodeRadius(node: GraphNodeData, degree: number): number {
  if (node.isAgent) return 15;
  return 6 + Math.min(degree, 6);
}

export function computeDegrees(edges: GraphEdgeData[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

export function linkEndpointId(end: string | SimNode): string {
  return typeof end === "string" ? end : end.id;
}
