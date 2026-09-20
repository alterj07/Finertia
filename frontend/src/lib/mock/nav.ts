import type { ModuleKey } from "@/lib/types";

export interface NavItem {
  key: ModuleKey;
  label: string;
  href: string;
  count?: number;
  needsAttention?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "command-center", label: "Command Center", href: "/" },
  { key: "payables", label: "Payables", href: "/payables", count: 7, needsAttention: true },
  { key: "receivables", label: "Receivables", href: "/receivables", count: 4, needsAttention: true },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation", count: 2 },
  { key: "close", label: "Close", href: "/close", count: 5, needsAttention: true },
  { key: "forecast", label: "Forecast", href: "/forecast" },
  { key: "audit", label: "Audit & Controls", href: "/audit" },
  { key: "deals", label: "Deals", href: "/deals", needsAttention: true },
  { key: "graph", label: "Data Graph", href: "/graph" },
];

export const MODULE_TITLES: Record<ModuleKey, string> = {
  "command-center": "Command Center",
  payables: "Payables",
  receivables: "Receivables",
  reconciliation: "Reconciliation",
  close: "Close",
  forecast: "Forecast",
  audit: "Audit & Controls",
  deals: "Deals",
  graph: "Data Graph",
};
