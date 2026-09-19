import type { LedgerRowData } from "@/lib/types";

export const PAYABLES_APPROVAL_QUEUE: LedgerRowData[] = [
  {
    id: "inv-8901",
    tag: "flag",
    primary: "Halberd Fabrication — Invoice #4471",
    secondary: "New vendor, no payment history, bank details changed after PO",
    amount: "$18,400.00",
    detail: {
      prose: [
        "Halberd Fabrication has no prior payment history in the ledger. Its banking details were changed 2 days ago, one day after the associated purchase order was issued — a sequence that matches vendor-impersonation patterns more often than legitimate updates.",
        "Recommend verifying the new banking details directly with a known contact at the vendor (not the email that sent the change request) before releasing payment.",
      ],
      evidence: [
        "vendor_id: v-8842 (created 2026-09-17)",
        "prior_invoices: 0",
        "po_reference: PO-88301 (issued 2026-09-16)",
        "bank_details_changed: 2026-09-18 14:02 UTC, via email request",
        "policy_rule: NEW_VENDOR_THRESHOLD_2500 → triggered",
      ],
      actions: [
        { label: "Verify vendor & release", kind: "primary" },
        { label: "Reject & notify vendor", kind: "secondary" },
        { label: "Open full invoice", kind: "ghost", href: "/payables/invoices/8901" },
      ],
    },
  },
  {
    id: "inv-8902",
    tag: "review",
    primary: "Meridian Co. — Invoice #4483",
    secondary: "Duplicate PO reference — matches PO-88213, already invoiced once",
    amount: "$12,040.00",
    detail: {
      prose: [
        "This invoice references PO-88213, which was already fully invoiced on 2026-09-02 by invoice #4390 for the same amount. This may be a duplicate submission from the vendor's billing system rather than a new charge.",
      ],
      evidence: [
        "po_reference: PO-88213 (fully invoiced 2026-09-02)",
        "matching_invoice: #4390, $12,040.00, paid 2026-09-05",
        "similarity_score: 0.97",
      ],
      actions: [
        { label: "Reject as duplicate", kind: "primary" },
        { label: "Approve anyway", kind: "secondary" },
        { label: "View original invoice", kind: "ghost", href: "/payables" },
      ],
    },
  },
  {
    id: "inv-8903",
    tag: "review",
    primary: "Meridian Co. — Invoice #4484",
    secondary: "Over-PO amount — 7.5% above PO-88213 tolerance",
    amount: "$12,040.00",
    detail: {
      prose: [
        "Invoice exceeds its purchase order by 7.5%, above the 3% auto-approve tolerance. Meridian Co. has an 18-month clean payment history; two of its last three overages reconciled to freight surcharges once reviewed.",
      ],
      evidence: [
        "po_reference: PO-88240, PO amount $11,200.00",
        "invoice_amount: $12,040.00 (+7.5%)",
        "vendor_history: 34 invoices, 0 prior disputes",
      ],
      actions: [
        { label: "Approve as freight variance", kind: "primary" },
        { label: "Request itemized invoice", kind: "secondary" },
        { label: "View PO", kind: "ghost", href: "/payables" },
      ],
    },
  },
  {
    id: "inv-8904",
    tag: "review",
    primary: "Cobalt Logistics — Invoice #2210",
    secondary: "No PO on file — services rendered under verbal agreement",
    amount: "$6,750.00",
    detail: {
      prose: [
        "No purchase order exists for this invoice. Cobalt Logistics is an established vendor (26-month history) but this specific engagement was not pre-approved via PO.",
      ],
      evidence: ["vendor_history: 41 invoices, avg $4,200.00", "po_reference: none found"],
      actions: [
        { label: "Approve & request retroactive PO", kind: "primary" },
        { label: "Reject, require PO first", kind: "secondary" },
      ],
    },
  },
  {
    id: "inv-8905",
    tag: "flag",
    primary: "Sable & Iron Supply — Invoice #991",
    secondary: "New vendor, first invoice, $14,200 — above new-vendor threshold",
    amount: "$14,200.00",
    detail: {
      prose: [
        "First invoice from this vendor, and it is 5.7x the new-vendor auto-approve threshold. No fraud indicators beyond the pattern itself — banking details were verified via phone at vendor onboarding.",
      ],
      evidence: [
        "vendor_id: v-9012 (onboarded 2026-08-29, phone-verified)",
        "prior_invoices: 0",
      ],
      actions: [
        { label: "Approve", kind: "primary" },
        { label: "Escalate to controller", kind: "secondary" },
      ],
    },
  },
  {
    id: "inv-8906",
    tag: "review",
    primary: "Northline Freight — Invoice #7790",
    secondary: "Rate variance vs. contracted freight schedule",
    amount: "$2,140.00",
    detail: {
      prose: [
        "Line-item freight rate is 12% above the contracted rate schedule signed 2026-03-01. Could be a fuel surcharge not yet reflected in the base contract.",
      ],
      evidence: ["contract_ref: NF-2026-03", "rate_delta: +12.0%"],
      actions: [
        { label: "Approve with note", kind: "primary" },
        { label: "Request rate breakdown", kind: "secondary" },
      ],
    },
  },
  {
    id: "inv-8907",
    tag: "review",
    primary: "Aldergate Print Co. — Invoice #5541",
    secondary: "Amount exceeds department budget for September",
    amount: "$4,980.00",
    detail: {
      prose: [
        "This invoice would bring the Marketing department's September spend to 104% of its approved budget. Department head has not been notified yet.",
      ],
      evidence: ["dept_budget: Marketing, $48,000.00", "mtd_spend_before: $46,120.00"],
      actions: [
        { label: "Approve & notify dept head", kind: "primary" },
        { label: "Hold for dept approval", kind: "secondary" },
      ],
    },
  },
];

export const PAYABLES_AUTO_PAID_SUMMARY = {
  count: 41,
  total: "$118,640.00",
  weekOf: "Sep 15–19",
};

export const PAYABLES_AUTO_PAID_LEDGER: LedgerRowData[] = [
  { id: "ap-1", tag: "auto", primary: "Vantage Office Supply — Invoice #3301", secondary: "Matched PO-88190, verified vendor", amount: "$1,240.00" },
  { id: "ap-2", tag: "auto", primary: "Cobalt Logistics — Invoice #2198", secondary: "Matched PO-88175, verified vendor", amount: "$3,860.00" },
  { id: "ap-3", tag: "auto", primary: "Brightline Cloud Hosting — Invoice #9021", secondary: "Recurring subscription, matched contract", amount: "$4,200.00" },
  { id: "ap-4", tag: "auto", primary: "Meridian Co. — Invoice #4470", secondary: "Matched PO-88180, within tolerance", amount: "$2,980.00" },
  { id: "ap-5", tag: "auto", primary: "Ferro Industrial Parts — Invoice #661", secondary: "Matched PO-88155, verified vendor", amount: "$1,875.00" },
  { id: "ap-6", tag: "auto", primary: "Northline Freight — Invoice #7780", secondary: "Matched contract rate schedule", amount: "$980.00" },
];
