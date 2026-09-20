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
  { key: "payables", label: "Payables", href: "/payables" },
  { key: "receivables", label: "Receivables", href: "/receivables" },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation" },
  { key: "close", label: "Close", href: "/close" },
  { key: "forecast", label: "Forecast", href: "/forecast" },
  { key: "audit", label: "Audit & Controls", href: "/audit" },
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
  graph: "Data Graph",
};
