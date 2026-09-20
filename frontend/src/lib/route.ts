import type { ModuleKey } from "@/lib/types";

export function pathToModule(pathname: string): ModuleKey {
  if (pathname === "/") return "command-center";
  const segment = pathname.split("/")[1];
  switch (segment) {
    case "payables":
      return "payables";
    case "receivables":
      return "receivables";
    case "reconciliation":
      return "reconciliation";
    case "close":
      return "close";
    case "forecast":
      return "forecast";
    case "flight-simulator":
      return "flight-simulator";
    case "audit":
      return "audit";
    case "deals":
      return "deals";
    case "graph":
      return "graph";
    default:
      return "command-center";
  }
}
