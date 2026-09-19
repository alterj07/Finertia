import type { LedgerRowData } from "@/lib/types";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  actor: "system" | "human";
  actorName: string;
  action: string;
  amount?: string;
}

export const EXAMPLE_QA: LedgerRowData = {
  id: "qa-example",
  primary: "Why did gross margin drop in August?",
  secondary: "Asked by soumik2025@gmail.com · 2026-09-18 09:14",
  detail: {
    prose: [
      "Gross margin fell 2.1 points from 63.5% to 61.4% month-over-month. The decline is explained by three drivers: a carrier freight rate increase effective September 1 (-1.4 pts), a one-time obsolete-inventory reserve write-down (-1.1 pts), and a favorable product mix shift toward higher-margin SKUs (+0.4 pts).",
      "Net of the one-time inventory item, the underlying margin decline is 1.0 point, driven by freight.",
    ],
    evidence: [
      "journal_entry: JE-20260901-4 (freight rate accrual)",
      "journal_entry: JE-20260930-1 (inventory reserve, $184,200)",
      "source_dataset: cogs_ledger_2026_09.csv, rows 1–4,812",
      "agent: Close Agent, confidence: 94%",
    ],
    actions: [
      { label: "View full evidence packet", kind: "primary", href: "/graph" },
      { label: "Export for PBC request", kind: "secondary" },
    ],
  },
};

export const ACTIVITY_LOG: ActivityLogEntry[] = [
  { id: "log-1", timestamp: "2026-09-19 06:02 UTC", actor: "system", actorName: "AP Agent", action: "Auto-paid batch of 41 invoices under policy", amount: "$118,640.00" },
  { id: "log-2", timestamp: "2026-09-19 06:04 UTC", actor: "system", actorName: "AP Agent", action: "Held invoice #4471 (Halberd Fabrication) — new-vendor threshold triggered", amount: "$18,400.00" },
  { id: "log-3", timestamp: "2026-09-19 06:10 UTC", actor: "system", actorName: "Reconciliation Agent", action: "Matched 312 of 318 Chase Operating transactions" },
  { id: "log-4", timestamp: "2026-09-19 07:22 UTC", actor: "human", actorName: "Priya N.", action: "Approved invoice #4483 (Meridian Co.) as freight variance", amount: "$12,040.00" },
  { id: "log-5", timestamp: "2026-09-19 07:40 UTC", actor: "system", actorName: "AR Agent", action: "Sent 2nd reminder — Delacroix Furnishings, invoice #7701", amount: "$8,400.00" },
  { id: "log-6", timestamp: "2026-09-19 08:05 UTC", actor: "system", actorName: "AR Agent", action: "Drafted dispute reply — Northline Freight, invoice #7790 (pending human send)" },
  { id: "log-7", timestamp: "2026-09-19 08:30 UTC", actor: "human", actorName: "Soumik S.", action: "Edited and sent dispute reply — Northline Freight" },
  { id: "log-8", timestamp: "2026-09-18 22:10 UTC", actor: "system", actorName: "Close Agent", action: "Posted inventory reserve true-up journal entry", amount: "$184,200.00" },
  { id: "log-9", timestamp: "2026-09-18 19:44 UTC", actor: "system", actorName: "Forecast Agent", action: "Refreshed 13-week cash forecast — base case" },
  { id: "log-10", timestamp: "2026-09-18 16:12 UTC", actor: "human", actorName: "Marcus K.", action: "Approved deferred revenue schedule update" },
  { id: "log-11", timestamp: "2026-09-18 11:03 UTC", actor: "system", actorName: "Reconciliation Agent", action: "Flagged Silicon Valley Bank payroll account — 3 unmatched transactions" },
  { id: "log-12", timestamp: "2026-09-17 15:20 UTC", actor: "system", actorName: "AR Agent", action: "Flagged Union Bay Retail as rising risk", amount: "$41,900.00" },
];
