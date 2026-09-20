import type { ModuleKey } from "@/lib/types";

export function pathToModule(pathname: string): ModuleKey {
  if (pathname === "/") return "command-center";
  const segment = pathname.split("/")[1];
  switch (segment) {
    case "financial-operations":
    case "payables":
    case "receivables":
    case "reconciliation":
    case "close":
    case "deals":
    case "forecast":
    case "audit":
      return "financial-operations";
    case "flight-simulator":
      return "flight-simulator";
    case "graph":
      return "graph";
    default:
      return "command-center";
  }
}
