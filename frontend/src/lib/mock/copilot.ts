import type { ModuleCopilotScript, ModuleKey } from "@/lib/types";

export const COPILOT_SCRIPTS: Record<ModuleKey, ModuleCopilotScript> = {
  "command-center": {
    opening:
      "Good morning. Overnight, agents handled 41 auto-paid invoices and reconciled 3 of 4 bank feeds without incident. Two items need your attention: a held invoice from a new vendor, and a rising-risk customer flag.",
    openingCitations: [{ label: "View overnight activity log", href: "/audit" }],
    suggestions: [
      "Why did cash drop this week?",
      "What needs my approval today?",
      "Summarize overnight activity",
    ],
    answers: {
      "Why did cash drop this week?": {
        text: "Cash fell 2.1% week-over-week, from $4.92M to $4.82M. The move is driven by the $118,640 auto-paid batch clearing Tuesday and a $41,900 receivable from Union Bay Retail now 45+ days past due that hasn't collected as forecast.",
        citations: [
          { label: "View auto-paid batch", href: "/payables" },
          { label: "View Union Bay Retail", href: "/receivables" },
        ],
      },
      "What needs my approval today?": {
        text: "Three items: a held invoice from Halberd Fabrication ($18,400, new-vendor flag), three over-PO invoices from Meridian Co. ($34,120 combined), and a dispute reply to Northline Freight awaiting your edit before it can send.",
        citations: [
          { label: "View Payables queue", href: "/payables" },
          { label: "View Receivables dispute", href: "/receivables" },
        ],
      },
      "Summarize overnight activity": {
        text: "41 invoices auto-paid under policy ($118,640 total). 312 of 318 Chase Operating transactions matched automatically. One new-vendor invoice held for review, three Meridian Co. invoices proposed for over-PO approval, and Union Bay Retail flagged as rising risk.",
        citations: [{ label: "View overnight activity log", href: "/audit" }],
      },
    },
  },
  payables: {
    opening:
      "This module tracks every invoice outside auto-approve policy. 7 invoices need your attention this cycle — 2 are flagged as fraud-risk patterns (new vendor, changed bank details), the rest are policy exceptions like over-PO amounts.",
    openingCitations: [{ label: "View approval queue", href: "/payables" }],
    suggestions: [
      "Why was this invoice flagged?",
      "Show me all invoices over $10k",
      "Approve everything under policy",
    ],
    answers: {
      "Why was this invoice flagged?": {
        text: "The Halberd Fabrication invoice (#4471, $18,400) was flagged because the vendor has no payment history and its banking details changed one day after the purchase order was issued — a sequence more common in vendor-impersonation fraud than legitimate account updates.",
        citations: [{ label: "View invoice #4471", href: "/payables" }],
      },
      "Show me all invoices over $10k": {
        text: "Three invoices in the current queue exceed $10,000: Halberd Fabrication #4471 ($18,400), Meridian Co. #4483 ($12,040), and Meridian Co. #4484 ($12,040).",
        citations: [{ label: "View Payables queue", href: "/payables" }],
      },
      "Approve everything under policy": {
        text: "41 invoices already auto-paid this week fall fully within policy — matched PO, verified vendor, under $5,000. The 7 items in the approval queue are all outside policy by definition and need individual review; I won't bulk-approve those.",
        citations: [{ label: "View auto-paid batch", href: "/payables" }],
      },
    },
  },
  receivables: {
    opening:
      "Aging is stable except for the 60+ day bucket, which is up 18.2% week-over-week — mostly concentrated in one account, Union Bay Retail. Two dispute replies are drafted and waiting on your edit before they can send to customers.",
    openingCitations: [{ label: "View collections activity", href: "/receivables" }],
    suggestions: [
      "Which customers are highest risk?",
      "Draft a collections email to Acme",
      "Why is DSO trending up?",
    ],
    answers: {
      "Which customers are highest risk?": {
        text: "Union Bay Retail (risk score 31/100, down from 62) and Cormorant Retail Group (risk score 44/100, down from 58) are the two flagged accounts. Union Bay has $41,900 in invoices 45+ days past due with no response to two reminders.",
        citations: [{ label: "View collections activity", href: "/receivables" }],
      },
      "Draft a collections email to Acme": {
        text: "Acme Holdings doesn't have any past-due invoices in the current ledger, so there's nothing to draft a collections email for. If you meant a different account, name it and I'll pull the relevant invoices.",
      },
      "Why is DSO trending up?": {
        text: "Days sales outstanding is rising primarily because of Cormorant Retail Group, whose average days-to-pay increased from 22 to 41 over the last three billing cycles with no dispute filed — an early-warning pattern rather than a resolved collections issue.",
        citations: [{ label: "View Cormorant Retail Group", href: "/receivables" }],
      },
    },
  },
  reconciliation: {
    opening:
      "3 of 4 connected accounts are matching above 98%. Silicon Valley Bank's payroll account is the exception at 95.1% — one $6,200 transaction has no corresponding ledger entry, which needs investigation rather than a timing-difference explanation.",
    openingCitations: [{ label: "View SVB Payroll account", href: "/reconciliation" }],
    suggestions: [
      "Why are these 2 transactions unmatched?",
      "Show me last month's match rate",
      "Explain the Stripe variance",
    ],
    answers: {
      "Why are these 2 transactions unmatched?": {
        text: "On Silicon Valley Bank, txn #9910 ($6,200) has no matching ledger entry at all, and txn #9912 ($1,180) looks like a possible duplicate of txn #9902 posted two days earlier. Neither fits the usual bank-feed timing-lag pattern.",
        citations: [{ label: "View SVB Payroll account", href: "/reconciliation" }],
      },
      "Show me last month's match rate": {
        text: "August match rates: Chase Operating 99.2%, Stripe 97.8%, Amex Corporate 100%, SVB Payroll 99.4%. SVB's rate dropped 4.3 points this month, driven by the unmatched transactions currently under review.",
        citations: [{ label: "View Reconciliation accounts", href: "/reconciliation" }],
      },
      "Explain the Stripe variance": {
        text: "Stripe changed its fee schedule on September 8 (2.9%+$0.30 → 2.7%+$0.30), but the ledger's fee-matching rule kept using the old rate for three transactions, over-accruing fees by $412.60. A true-up journal entry has been proposed.",
        citations: [{ label: "View Stripe account", href: "/reconciliation" }],
      },
    },
  },
  close: {
    opening:
      "4 days remain in the September close. 3 checklist items are blocked or in progress on the agent side; intercompany eliminations are blocked pending a response from Marcus K. Gross margin compressed 2.1 points and is explained below.",
    openingCitations: [{ label: "View close checklist", href: "/close" }],
    suggestions: [
      "What's blocking close?",
      "Why did COGS move 2.1 pts?",
      "Show me the accrual for marketing",
    ],
    answers: {
      "What's blocking close?": {
        text: "Intercompany eliminations review is blocked, owned by MK — no update since it was assigned. Two other items are agent-in-progress (marketing accrual, payroll accrual) and expected to complete before the deadline.",
        citations: [{ label: "View close checklist", href: "/close" }],
      },
      "Why did COGS move 2.1 pts?": {
        text: "Gross margin fell 2.1 points month-over-month: a freight rate increase cost 1.4 points, a one-time obsolete-inventory write-down cost 1.1 points, and a favorable product mix shift added back 0.4 points.",
        citations: [{ label: "View variance detail", href: "/close" }],
      },
      "Show me the accrual for marketing": {
        text: "Marketing OpEx is $412,000 versus $362,000 prior month, a $50,000 increase. $38,000 of that is a Q4 campaign prepay accrued this period rather than spread across the campaign; the remaining $12,000 is routine spend growth.",
        citations: [{ label: "View variance detail", href: "/close" }],
      },
    },
  },
  forecast: {
    opening:
      "Base case shows a trough of $4.21M in week 7, comfortably above the $3.8M covenant floor. Try the scenario chips below the chart to see how a 2-week AR slip or a new credit line would change that.",
    openingCitations: [{ label: "View Forecast scenarios", href: "/forecast" }],
    suggestions: [
      "What if collections slip 2 weeks?",
      "Why did the forecast change?",
      "Show me the runway scenario",
    ],
    answers: {
      "What if collections slip 2 weeks?": {
        text: "Under the 'AR slips 2 weeks' scenario, the trough drops further and covenant headroom narrows. Select that scenario chip above the chart to see the exact week-by-week path.",
        citations: [{ label: "View Forecast scenarios", href: "/forecast" }],
      },
      "Why did the forecast change?": {
        text: "The forecast refreshed overnight after Union Bay Retail's risk flag lowered the collections-probability weighting on $41,900 of receivables, and the auto-paid batch cleared as expected on schedule.",
        citations: [{ label: "View Forecast", href: "/forecast" }],
      },
      "Show me the runway scenario": {
        text: "At the current base-case burn trajectory, runway is 14.2 months. The 'New credit line' scenario extends the trough headroom by roughly $500K starting week 5.",
        citations: [{ label: "View Forecast scenarios", href: "/forecast" }],
      },
    },
  },
  audit: {
    opening:
      "This is the copilot's permanent record for auditors and controllers. Every question asked here is logged below alongside the underlying evidence. Ask about any number and I'll show my work.",
    suggestions: [
      "Why did gross margin drop in August?",
      "Pull evidence for the PP&E rollforward",
      "Who approved this journal entry?",
    ],
    answers: {
      "Why did gross margin drop in August?": {
        text: "Gross margin fell 2.1 points from 63.5% to 61.4%. Freight rate increases cost 1.4 points, a one-time inventory write-down cost 1.1 points, and a favorable mix shift added back 0.4 points. See the logged Q&A below for the full evidence trail.",
        citations: [{ label: "View logged answer", href: "/audit" }],
      },
      "Pull evidence for the PP&E rollforward": {
        text: "The PP&E rollforward references one reference dataset — the depreciation schedule last touched September 14 — with no open variances this cycle.",
        citations: [{ label: "View in Data Graph", href: "/graph" }],
      },
      "Who approved this journal entry?": {
        text: "The Stripe fee true-up journal entry is still pending approval — proposed by the Reconciliation Agent on September 19, not yet signed off by a human. The inventory reserve entry was posted by the Close Agent and reviewed by Priya N.",
        citations: [{ label: "View activity log", href: "/audit" }],
      },
    },
  },
  graph: {
    opening:
      "This graph shows which agent produced or consumed which document, aggregated to one node per vendor, customer, account, or model. Click any node to expand it into its underlying documents.",
    suggestions: [
      "What documents feed the 13-week forecast?",
      "What else touches Invoice #5512?",
      "Show me everything Meridian Co. is linked to",
    ],
    answers: {
      "What documents feed the 13-week forecast?": {
        text: "The 13-week forecast model reads three reference feeds: AR aging (from Union Bay Retail and other customer accounts), AP aging (from Meridian Co. and other vendors), and the Chase Operating bank balance feed.",
        citations: [{ label: "Open Data Graph", href: "/graph" }],
      },
      "What else touches Invoice #5512?": {
        text: "No document with that exact ID is loaded in the current period's graph. The closest matches are Invoice #5541 (Aldergate Print Co.) — try expanding that vendor node on the canvas.",
      },
      "Show me everything Meridian Co. is linked to": {
        text: "Meridian Co. connects to the AP Agent, two open invoices (#4483, #4484), two purchase orders (PO-88213, PO-88240), and the 13-week forecast model, which reads its AP aging. Click the Meridian Co. node to expand and trace each connection.",
        citations: [{ label: "Open Data Graph", href: "/graph" }],
      },
    },
  },
};

export const COPILOT_FALLBACK =
  "I don't have a canned answer for that in this demo build — in production this would route to the live agent runtime. Try one of the suggested questions for this screen.";
