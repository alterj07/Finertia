import type { ChecklistItemData, KpiCellData, LedgerRowData } from "@/lib/types";

export const COMMAND_CENTER_KPIS: KpiCellData[] = [
  { label: "Cash", value: "$4.82M", delta: "-2.1% w/w", favorable: false },
  { label: "AR outstanding", value: "$1.94M", delta: "+3.4% w/w", favorable: false },
  { label: "AP outstanding", value: "$886K", delta: "+6.0% w/w", favorable: true },
  { label: "Runway", value: "14.2 mo", delta: "-0.3 mo w/w", favorable: false },
];

export const OVERNIGHT_ACTIVITY: LedgerRowData[] = [
  {
    id: "oa-1",
    tag: "flag",
    primary: "New vendor invoice held — no payment history",
    secondary: "Halberd Fabrication · Invoice #4471 · $18,400.00",
    amount: "$18,400.00",
    detail: {
      prose: [
        "AP Agent held this invoice rather than routing it to auto-approve. Halberd Fabrication has no prior payment history in the ledger, and the invoice amount exceeds the new-vendor threshold of $2,500.",
        "This pattern — new vendor, first invoice, above-threshold amount — is the profile most correlated with vendor-impersonation fraud in the last 12 months of enterprise AP data. Recommend manual verification of banking details before payment.",
      ],
      evidence: [
        "vendor_id: v-8842 (created 2026-09-17, 2 days ago)",
        "prior_invoices: 0",
        "bank_details_changed: true (2026-09-18 14:02 UTC)",
        "policy_rule: NEW_VENDOR_THRESHOLD_2500 → triggered",
      ],
      actions: [
        { label: "Verify vendor & release", kind: "primary" },
        { label: "Reject & notify vendor", kind: "secondary" },
        { label: "View vendor record", kind: "ghost", href: "/payables" },
      ],
    },
  },
  {
    id: "oa-2",
    tag: "review",
    primary: "3 invoices proposed for approval — over-PO amount",
    secondary: "Meridian Co. · Combined $34,120.00",
    amount: "$34,120.00",
    detail: {
      prose: [
        "AP Agent matched these invoices to open purchase orders, but each invoice exceeds its PO by 4–9%, above the 3% auto-approve tolerance. Meridian Co. has a clean 18-month payment history with no prior overages.",
        "Recommend approving as a rounding/freight variance — this vendor's overages have historically reconciled to freight surcharges, confirmed in 2 of the last 3 similar cases.",
      ],
      evidence: [
        "PO-88213: invoice $12,040 vs PO $11,200 (+7.5%)",
        "PO-88240: invoice $9,880 vs PO $9,400 (+5.1%)",
        "PO-88255: invoice $12,200 vs PO $11,600 (+5.2%)",
      ],
      actions: [
        { label: "Approve all 3", kind: "primary" },
        { label: "Approve individually", kind: "secondary" },
        { label: "View all 3", kind: "ghost", href: "/payables" },
      ],
    },
  },
  {
    id: "oa-3",
    tag: "auto",
    primary: "Auto-paid batch — 41 invoices under policy",
    secondary: "All under $5,000, matched PO, verified vendor",
    amount: "$118,640.00",
    detail: {
      prose: [
        "All 41 invoices matched an open purchase order within tolerance, came from a vendor with an established payment history, and were individually under the $5,000 auto-pay ceiling.",
      ],
      actions: [{ label: "View batch", kind: "ghost", href: "/payables" }],
    },
  },
  {
    id: "oa-4",
    tag: "auto",
    primary: "Bank feed reconciled — Chase Operating",
    secondary: "312 of 318 transactions matched automatically",
    amount: "98.1%",
    detail: {
      prose: [
        "312 of 318 transactions on the Chase Operating feed matched to ledger entries automatically. The 6 unmatched items are queued in Reconciliation for review — none are flagged as breaks.",
      ],
      actions: [{ label: "Open Reconciliation", kind: "ghost", href: "/reconciliation" }],
    },
  },
  {
    id: "oa-5",
    tag: "flag",
    primary: "Customer risk score dropped — Union Bay Retail",
    secondary: "3 invoices now 45+ days past due, no response to reminders",
    amount: "$41,900.00",
    detail: {
      prose: [
        "Union Bay Retail's risk score moved from 62 to 31 (of 100) after two automated reminders went unanswered and a third invoice crossed 45 days past due. This customer represents 2.1% of trailing-12-month revenue.",
        "Recommend moving this account to prepay terms for future orders and escalating current balance to a human-drafted collections call.",
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
        { label: "View customer", kind: "ghost", href: "/receivables" },
      ],
    },
  },
  {
    id: "oa-6",
    tag: "review",
    primary: "Dispute reply drafted — Northline Freight",
    secondary: "Customer disputes freight surcharge on invoice #7790",
    amount: "$2,140.00",
    detail: {
      prose: [
        "AR Agent drafted a reply citing the signed rate sheet addendum. This goes to a human for edit and send — dispute replies are never auto-sent.",
      ],
      actions: [
        { label: "Review draft", kind: "primary", href: "/receivables" },
        { label: "View dispute", kind: "ghost", href: "/receivables" },
      ],
    },
  },
];

export const CLOSE_MINI_CHECKLIST: ChecklistItemData[] = [
  { id: "cc-1", label: "Bank reconciliations — all accounts", status: "done", owner: "agent" },
  { id: "cc-2", label: "Accrue September marketing spend", status: "in-progress", owner: "agent" },
  { id: "cc-3", label: "Review intercompany eliminations", status: "blocked", owner: "MK" },
  { id: "cc-4", label: "Post payroll journal entry", status: "todo", owner: "you" },
  { id: "cc-5", label: "Fixed asset rollforward review", status: "todo", owner: "you" },
];
