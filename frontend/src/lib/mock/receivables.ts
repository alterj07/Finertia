import type { KpiCellData, LedgerRowData } from "@/lib/types";

export const RECEIVABLES_AGING: KpiCellData[] = [
  { label: "Current", value: "$1,102,400" },
  { label: "1–30 days", value: "$412,800" },
  { label: "31–60 days", value: "$284,100" },
  { label: "60+ days", value: "$144,900", delta: "+18.2% w/w", favorable: false },
];

export const COLLECTIONS_ACTIVITY: LedgerRowData[] = [
  {
    id: "col-1",
    tag: "auto",
    primary: "Reminder sent — Delacroix Furnishings",
    secondary: "Invoice #7701, 12 days past due · 2nd reminder",
    amount: "$8,400.00",
    detail: {
      prose: ["Automated reminder sent per the standard 3/10/20-day cadence. No response required unless the customer replies."],
      actions: [{ label: "View invoice", kind: "ghost", href: "/receivables" }],
    },
  },
  {
    id: "col-2",
    tag: "review",
    primary: "Dispute reply drafted — Northline Freight",
    secondary: "Customer disputes freight surcharge, invoice #7790",
    amount: "$2,140.00",
    detail: {
      prose: [
        "Customer disputes a freight surcharge line item. AR Agent drafted a reply citing the signed rate sheet addendum (NF-2026-03) that authorizes the surcharge. This draft requires human review and edit before sending — dispute replies are never auto-sent to customers.",
      ],
      evidence: ["contract_ref: NF-2026-03, signed 2026-03-01", "surcharge_clause: Section 4.2"],
      actions: [
        { label: "Edit & send reply", kind: "primary" },
        { label: "Escalate to account manager", kind: "secondary" },
      ],
    },
  },
  {
    id: "col-3",
    tag: "flag",
    primary: "Rising risk — Union Bay Retail",
    secondary: "Risk score 31/100 (was 62), 3 invoices 45+ days past due",
    amount: "$41,900.00",
    detail: {
      prose: [
        "Risk score dropped from 62 to 31 after two automated reminders went unanswered. This customer represents 2.1% of trailing-12-month revenue.",
        "Recommend moving this account to prepay terms for future orders.",
      ],
      evidence: [
        "invoice #7710: 52 days past due, $18,400.00",
        "invoice #7742: 47 days past due, $14,200.00",
        "invoice #7761: 45 days past due, $9,300.00",
        "reminder_log: 2 sent, 0 opened",
      ],
      actions: [
        { label: "Move to prepay terms", kind: "primary" },
        { label: "Draft collections call brief", kind: "secondary" },
      ],
    },
  },
  {
    id: "col-4",
    tag: "auto",
    primary: "Reminder sent — Aldergate Print Co.",
    secondary: "Invoice #7788, 4 days past due · 1st reminder",
    amount: "$3,120.00",
  },
  {
    id: "col-5",
    tag: "flag",
    primary: "Rising risk — Cormorant Retail Group",
    secondary: "Risk score 44/100 (was 58), payment cadence slowing 3 cycles running",
    amount: "$27,300.00",
    detail: {
      prose: [
        "Cormorant's average days-to-pay has increased from 22 to 41 over the last three billing cycles, with no dispute filed. This is an early-warning pattern, not yet a collections issue.",
      ],
      evidence: ["dtp_trend: 22 → 31 → 41 days", "open_invoices: 4, none past due yet"],
      actions: [
        { label: "Flag for account review", kind: "primary" },
        { label: "No action — monitor", kind: "secondary" },
      ],
    },
  },
  {
    id: "col-6",
    tag: "review",
    primary: "Dispute reply drafted — Pemberton Goods",
    secondary: "Customer disputes quantity billed on invoice #7803",
    amount: "$5,660.00",
    detail: {
      prose: [
        "Customer claims 40 units were delivered against an invoice for 48. Warehouse shipping log confirms 48 units shipped; AR Agent drafted a reply attaching the signed delivery receipt.",
      ],
      evidence: ["shipping_log: 48 units, signed receipt 2026-09-10"],
      actions: [{ label: "Edit & send reply", kind: "primary" }, { label: "Escalate", kind: "secondary" }],
    },
  },
];
