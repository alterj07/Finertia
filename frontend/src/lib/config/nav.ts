import type { LucideIcon } from "lucide-react";
import { Landmark, LayoutDashboard, Plane, Waypoints } from "lucide-react";
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
  {
    key: "financial-operations",
    label: "Financial Operations",
    href: "/financial-operations",
    icon: Landmark,
    needsAttention: true,
  },
  { key: "flight-simulator", label: "Flight Simulator", href: "/flight-simulator", icon: Plane },
  { key: "graph", label: "Data Graph", href: "/graph", icon: Waypoints },
];

export const MODULE_TITLES: Record<ModuleKey, string> = {
  "command-center": "Dashboard",
  "financial-operations": "Financial Operations",
  "flight-simulator": "Flight Simulator",
  graph: "Data Graph",
};
