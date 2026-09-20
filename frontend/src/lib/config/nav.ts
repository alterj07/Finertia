import type { LucideIcon } from "lucide-react";
import {
  BookCheck,
  HandCoins,
  Handshake,
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
  { key: "command-center", label: "Command Center", href: "/", icon: LayoutDashboard },
  { key: "payables", label: "Payables", href: "/payables", icon: Receipt },
  { key: "receivables", label: "Receivables", href: "/receivables", icon: HandCoins },
  { key: "reconciliation", label: "Reconciliation", href: "/reconciliation", icon: Scale },
  { key: "close", label: "Close", href: "/close", icon: BookCheck },
  { key: "forecast", label: "Forecast", href: "/forecast", icon: TrendingUp },
  { key: "flight-simulator", label: "Flight Simulator", href: "/flight-simulator", icon: Plane },
  { key: "audit", label: "Audit & Controls", href: "/audit", icon: ShieldCheck },
  { key: "deals", label: "Deals", href: "/deals", icon: Handshake, needsAttention: true },
  { key: "graph", label: "Data Graph", href: "/graph", icon: Waypoints },
];

export const MODULE_TITLES: Record<ModuleKey, string> = {
  "command-center": "Command Center",
  payables: "Payables",
  receivables: "Receivables",
  reconciliation: "Reconciliation",
  close: "Close",
  forecast: "Forecast",
  "flight-simulator": "Flight Simulator",
  audit: "Audit & Controls",
  deals: "Deals",
  graph: "Data Graph",
};
