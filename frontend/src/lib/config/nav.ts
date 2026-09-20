import type { LucideIcon } from "lucide-react";
import {
  BookCheck,
  HandCoins,
  LayoutDashboard,
  Plane,
  Receipt,
  Scale,
  ShieldCheck,
  TrendingUp,
  Waypoints,
} from "lucide-react";
import type { ModuleKey } from "@/lib/types";

export interface NavItem {
  key: ModuleKey;
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
  needsAttention?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "command-center", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { key: "payables", label: "Payables", href: "/payables", icon: Receipt },
  { key: "receivables", label: "Receivables", href: "/receivables", icon: HandCoins },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation", icon: Scale },
  { key: "close", label: "Close", href: "/close", icon: BookCheck, needsAttention: true },
  { key: "forecast", label: "Forecast", href: "/forecast", icon: TrendingUp },
  { key: "flight-simulator", label: "Flight Simulator", href: "/flight-simulator", icon: Plane },
  { key: "audit", label: "Audit & Controls", href: "/audit", icon: ShieldCheck },
  { key: "graph", label: "Data Graph", href: "/graph", icon: Waypoints },
];

export const MODULE_TITLES: Record<ModuleKey, string> = {
  "command-center": "Dashboard",
  payables: "Payables",
  receivables: "Receivables",
  reconciliation: "Reconciliation",
  close: "Close",
  forecast: "Forecast",
  "flight-simulator": "Flight Simulator",
  audit: "Audit & Controls",
  graph: "Data Graph",
};
