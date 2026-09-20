import type { AutonomyWorkflow } from "@/lib/types";

export const AUTONOMY_WORKFLOWS: AutonomyWorkflow[] = [
  { id: "ap-under-5k", workflow: "AP under $5k", module: "payables", level: "auto" },
  { id: "ap-exceptions", workflow: "AP exceptions", module: "payables", level: "assisted" },
  { id: "recon-match", workflow: "Recon match", module: "reconciliation", level: "auto" },
  { id: "ar-dunning", workflow: "AR dunning", module: "receivables", level: "assisted" },
  { id: "ar-dispute-reply", workflow: "AR dispute replies", module: "receivables", level: "assisted" },
  { id: "close-accruals", workflow: "Close accruals", module: "close", level: "assisted" },
  { id: "journal-entries", workflow: "Journal entries", module: "close", level: "manual" },
  { id: "forecast-refresh", workflow: "Forecast refresh", module: "forecast", level: "auto" },
];
