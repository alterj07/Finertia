import type { ModuleCopilotScript, ModuleKey } from "@/lib/types";

export const COPILOT_SCRIPTS: Record<ModuleKey, ModuleCopilotScript> = {
  deals: {
    opening:
      "Deals view. The Deals agent reads the inbox, separates sales opportunities from operations mail, sizes each one and checks the customer's payment record before drafting a reply.",
    openingCitations: [],
    suggestions: [
      "Which deals have a credit risk?",
      "What is the pipeline estimate?",
      "Why is the Vantage email not a deal?",
    ],
  },
  "command-center": {
    opening:
      "I'm Finertia. I answer from the shared memory graph and cite the bank lines, journal entries, invoices and emails I used. Ask about any number, or ask me to run the reconciliation.",
    openingCitations: [],
    suggestions: [
      "What findings are open right now?",
      "Run the Q1 bank reconciliation",
      "Which bank credit matched three invoices?",
    ],
  },
  payables: {
    opening:
      "Payables view. I can check an invoice against its journal posting, the bank line that paid it, and the emails around it.",
    openingCitations: [],
    suggestions: [
      "Was INV-7781 paid twice?",
      "What do we know about Brightline Logistics?",
      "Show invoices with an amount mismatch",
    ],
  },
  receivables: {
    opening:
      "Receivables view. Ask about a customer's payments, short-pays, remittance advices or promises to pay.",
    openingCitations: [],
    suggestions: [
      "Why is AR-1044 still open?",
      "What did Helios pay in March?",
      "Has Crescent Hospitality paid anything this quarter?",
    ],
  },
  reconciliation: {
    opening:
      "Reconciliation view. I can explain any match the Cash & Reconciliation agent made, and record a correction if it got one wrong.",
    openingCitations: [],
    suggestions: [
      "Why is there a $72 difference on BP-4471?",
      "What is still unmatched at March 31?",
      "Explain the timing items",
    ],
  },
  close: {
    opening:
      "Close view. Ask what is blocking sign-off, which adjusting entries are proposed, and what evidence supports them.",
    openingCitations: [],
    suggestions: [
      "What adjusting entries are proposed?",
      "Are there unrecorded bank items?",
      "Summarise the reconciliation result",
    ],
  },
  forecast: {
    opening:
      "Forecast view. I can pull open receivables, promised payment dates and recurring outflows from the graph.",
    openingCitations: [],
    suggestions: [
      "Which customers have promised to pay?",
      "What recurring payments hit the operating account?",
      "List open receivables past due",
    ],
  },
  "flight-simulator": {
    opening:
      "Flight Simulator is a read-only planning sandbox. Adjust one cash lever, compare it with the base plan, then request a concise decision review.",
    openingCitations: [],
    suggestions: [
      "What happens if collections arrive 14 days earlier?",
      "How does delaying a vendor payment affect the cash floor?",
      "Which scenario should I review first?",
    ],
  },
  audit: {
    opening:
      "Audit view. Ask about vendor bank-detail changes, self-approved journals, or any control signal the graph has surfaced.",
    openingCitations: [],
    suggestions: [
      "Did any vendor change bank details?",
      "Show manual journals posted on a weekend",
      "What signals is the graph surfacing?",
    ],
  },
  graph: {
    opening:
      "Graph view. Ask me about any node you see and I'll walk its neighbourhood and cite the edges.",
    openingCitations: [],
    suggestions: [
      "What connects Helios Medical to the bank?",
      "Explain node BK00044",
      "Which findings involve BP-4471?",
    ],
  },
};
