import type { ModuleCopilotScript, ModuleKey } from "@/lib/types";

export const COPILOT_SCRIPTS: Record<ModuleKey, ModuleCopilotScript> = {
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
  "financial-operations": {
    opening:
      "Financial Operations. Ask about any invoice, customer, reconciliation match, close task, control signal or forecast line — I answer from the shared memory graph and cite what I used.",
    openingCitations: [],
    suggestions: [
      "Was INV-7781 paid twice?",
      "Why is there a $72 difference on BP-4471?",
      "What is blocking close sign-off?",
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
