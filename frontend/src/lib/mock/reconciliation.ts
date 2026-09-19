import type { LedgerRowData } from "@/lib/types";

export const RECONCILIATION_ACCOUNTS: LedgerRowData[] = [
  {
    id: "recon-chase",
    tag: "auto",
    primary: "Chase Operating",
    secondary: "312 of 318 transactions matched · 98.1% match rate",
    amount: "98.1%",
    detail: {
      prose: [
        "6 unmatched items remain, all timing differences from transactions posted to the bank feed after the ledger cutoff on 2026-09-18. None represent a real break.",
      ],
      evidence: [
        "txn_4471: $2,140.00 debit, bank-dated 2026-09-19, ledger pending",
        "txn_4472: $890.00 debit, bank-dated 2026-09-19, ledger pending",
        "txn_4473: $12,400.00 credit, bank-dated 2026-09-18 23:58, ledger next-day",
        "+ 3 more, all same pattern",
      ],
      actions: [
        { label: "Confirm as timing difference", kind: "primary" },
        { label: "View all 6", kind: "ghost" },
      ],
    },
  },
  {
    id: "recon-stripe",
    tag: "review",
    primary: "Stripe",
    secondary: "1,204 of 1,221 transactions matched · 98.6% match rate",
    amount: "98.6%",
    detail: {
      prose: [
        "17 unmatched items. 14 are timing differences (payout settlement lag). 3 represent a real variance: Stripe fee schedule changed on 2026-09-08 and the ledger is still using the prior rate for fee accrual.",
        "Recommend posting a journal entry to true up the fee accrual and updating the automated fee-matching rule going forward.",
      ],
      evidence: [
        "fee_rate_old: 2.9% + $0.30",
        "fee_rate_new: 2.7% + $0.30 (effective 2026-09-08)",
        "variance: $412.60 over-accrued across 3 transactions",
      ],
      actions: [
        { label: "Post true-up journal entry", kind: "primary" },
        { label: "Update fee-matching rule", kind: "secondary" },
        { label: "View evidence", kind: "ghost", href: "/audit" },
      ],
    },
  },
  {
    id: "recon-amex",
    tag: "auto",
    primary: "Amex Corporate Card",
    secondary: "486 of 486 transactions matched · 100% match rate",
    amount: "100%",
  },
  {
    id: "recon-silicon",
    tag: "flag",
    primary: "Silicon Valley Bank — Payroll",
    secondary: "58 of 61 transactions matched · 95.1% match rate",
    amount: "95.1%",
    detail: {
      prose: [
        "3 unmatched items do not fit the usual timing-difference pattern. One transaction for $6,200.00 has no corresponding ledger entry at all — possible mis-coded manual payment outside the payroll run.",
      ],
      evidence: [
        "txn_9910: $6,200.00 debit, 2026-09-15, no ledger match found",
        "txn_9911: $340.00 debit, 2026-09-16, likely bank fee, no ledger entry",
        "txn_9912: $1,180.00 debit, 2026-09-17, possible duplicate of txn_9902",
      ],
      actions: [
        { label: "Investigate $6,200 transaction", kind: "primary" },
        { label: "Escalate to controller", kind: "secondary" },
      ],
    },
  },
];
