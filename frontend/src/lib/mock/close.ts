import type { ChecklistItemData, LedgerRowData } from "@/lib/types";

export const CLOSE_DAYS_REMAINING = 4;

export const CLOSE_CHECKLIST: ChecklistItemData[] = [
  { id: "cl-1", label: "Bank reconciliations — all accounts", status: "done", owner: "agent" },
  { id: "cl-2", label: "Credit card reconciliation", status: "done", owner: "agent" },
  { id: "cl-3", label: "Accrue September marketing spend", status: "in-progress", owner: "agent" },
  { id: "cl-4", label: "Accrue September payroll & benefits", status: "in-progress", owner: "agent" },
  { id: "cl-5", label: "Review intercompany eliminations", status: "blocked", owner: "MK" },
  { id: "cl-6", label: "Post payroll journal entry", status: "todo", owner: "you" },
  { id: "cl-7", label: "Fixed asset rollforward review", status: "todo", owner: "you" },
  { id: "cl-8", label: "Revenue recognition review — new contracts", status: "todo", owner: "JT" },
  { id: "cl-9", label: "Inventory reserve true-up", status: "done", owner: "agent" },
  { id: "cl-10", label: "Deferred revenue schedule update", status: "in-progress", owner: "agent" },
  { id: "cl-11", label: "Prepare consolidated trial balance", status: "todo", owner: "you" },
  { id: "cl-12", label: "Management review & sign-off", status: "todo", owner: "you" },
];

export const VARIANCE_FLAGS: LedgerRowData[] = [
  {
    id: "var-cogs",
    tag: "flag",
    primary: "COGS — 2.1 pt margin compression",
    secondary: "Gross margin 61.4% vs. 63.5% prior month",
    amount: "-2.1 pts",
    detail: {
      prose: [
        "Gross margin fell 2.1 points month-over-month. The decline breaks down into three drivers: a freight cost increase, a one-time inventory write-down, and a favorable mix shift that partially offset the decline.",
      ],
      evidence: [
        "freight_cost_delta: -1.4 pts (carrier rate increase effective 2026-09-01)",
        "inventory_writedown: -1.1 pts (obsolete SKU reserve, one-time)",
        "mix_shift: +0.4 pts (higher-margin product line grew share)",
      ],
      waterfall: {
        unit: "pts",
        bars: [
          { label: "Aug", value: 63.5, kind: "start" },
          { label: "Freight", value: -1.4, kind: "negative" },
          { label: "Inventory", value: -1.1, kind: "negative" },
          { label: "Mix", value: 0.4, kind: "positive" },
          { label: "Sep", value: 61.4, kind: "end" },
        ],
      },
      actions: [
        { label: "Accept as explained", kind: "primary" },
        { label: "Request freight contract review", kind: "secondary" },
        { label: "View full evidence", kind: "ghost", href: "/audit" },
      ],
    },
  },
  {
    id: "var-opex",
    tag: "review",
    primary: "Marketing OpEx — 14% over prior month",
    secondary: "$412,000 vs. $362,000 prior month",
    amount: "+$50,000",
    detail: {
      prose: [
        "Marketing spend increase is driven primarily by a Q4 campaign prepay that was accrued this period rather than spread. Recommend confirming the accrual treatment with the marketing team before finalizing.",
      ],
      evidence: ["campaign_prepay: $38,000 (Q4 launch)", "remaining_variance: $12,000, routine spend increase"],
      waterfall: {
        unit: "$K",
        bars: [
          { label: "Aug", value: 362, kind: "start" },
          { label: "Prepay", value: 38, kind: "negative" },
          { label: "Routine", value: 12, kind: "negative" },
          { label: "Sep", value: 412, kind: "end" },
        ],
      },
      actions: [
        { label: "Confirm accrual treatment", kind: "primary" },
        { label: "Reclass to prepaid asset", kind: "secondary" },
      ],
    },
  },
  {
    id: "var-headcount",
    tag: "auto",
    primary: "Payroll — within 1.2% of forecast",
    secondary: "$1,204,000 vs. $1,190,000 forecast",
    amount: "+$14,000",
    detail: {
      prose: ["Variance is within the 2% threshold for auto-acceptance and driven by two mid-cycle new hires already reflected in headcount plan."],
      actions: [{ label: "View headcount detail", kind: "ghost" }],
    },
  },
];
