import type { GraphDataset, GraphNodeData } from "@/lib/types";

// Production-scale note (frontend.txt Section 11): a real ledger has orders
// of magnitude more documents than can be legibly force-rendered at once.
// The default view is aggregated to one node per entity (vendor, customer,
// journal batch, bank account, model, evidence bundle). Clicking an
// aggregate node expands it into its constituent documents via EXPANSIONS
// below, scoped to whatever is currently loaded/relevant for the active
// period — not the entire historical ledger.

const agents: GraphNodeData[] = [
  { id: "agent-ap", label: "AP Agent", group: "agent", isAgent: true, type: "Agent", lastTouched: "live" },
  { id: "agent-ar", label: "AR Agent", group: "agent", isAgent: true, type: "Agent", lastTouched: "live" },
  { id: "agent-recon", label: "Reconciliation Agent", group: "agent", isAgent: true, type: "Agent", lastTouched: "live" },
  { id: "agent-close", label: "Close Agent", group: "agent", isAgent: true, type: "Agent", lastTouched: "live" },
  { id: "agent-forecast", label: "Forecast Agent", group: "agent", isAgent: true, type: "Agent", lastTouched: "live" },
  { id: "agent-audit", label: "Audit Agent", group: "agent", isAgent: true, type: "Agent", lastTouched: "live" },
];

const aggregates: GraphNodeData[] = [
  // Payables
  { id: "vendor-meridian", label: "Meridian Co.", group: "payables", type: "Vendor", lastTouched: "2026-09-19", aggregate: true, children: ["inv-4483", "inv-4484", "po-88213", "po-88240"] },
  { id: "vendor-halberd", label: "Halberd Fabrication", group: "payables", type: "Vendor", lastTouched: "2026-09-19", aggregate: true, children: ["inv-4471", "vendor-record-8842"] },
  { id: "vendor-cobalt", label: "Cobalt Logistics", group: "payables", type: "Vendor", lastTouched: "2026-09-16", aggregate: true, children: ["inv-2210", "inv-2198"] },
  { id: "vendor-northline", label: "Northline Freight", group: "payables", type: "Vendor", lastTouched: "2026-09-17", aggregate: true, children: ["inv-7790-ap", "contract-nf2026"] },
  { id: "vendor-ferro", label: "Ferro Industrial Parts", group: "payables", type: "Vendor", lastTouched: "2026-09-12", aggregate: true, children: ["inv-661"] },
  { id: "vendor-aldergate", label: "Aldergate Print Co.", group: "payables", type: "Vendor", lastTouched: "2026-09-11", aggregate: true, children: ["inv-5541"] },

  // Receivables
  { id: "cust-unionbay", label: "Union Bay Retail", group: "receivables", type: "Customer", lastTouched: "2026-09-17", aggregate: true, children: ["inv-7710", "inv-7742", "inv-7761", "reminder-log-unionbay"] },
  { id: "cust-delacroix", label: "Delacroix Furnishings", group: "receivables", type: "Customer", lastTouched: "2026-09-19", aggregate: true, children: ["inv-7701"] },
  { id: "cust-cormorant", label: "Cormorant Retail Group", group: "receivables", type: "Customer", lastTouched: "2026-09-15", aggregate: true, children: ["risk-score-cormorant"] },
  { id: "cust-pemberton", label: "Pemberton Goods", group: "receivables", type: "Customer", lastTouched: "2026-09-10", aggregate: true, children: ["inv-7803"] },

  // Reconciliation
  { id: "bank-chase", label: "Chase Operating", group: "reconciliation", type: "Bank feed", lastTouched: "live", aggregate: true, children: ["txn-4471", "txn-4472", "txn-4473"] },
  { id: "bank-stripe", label: "Stripe", group: "reconciliation", type: "Bank feed", lastTouched: "live", aggregate: true, children: ["fee-schedule-stripe", "je-stripe-trueup"] },
  { id: "bank-svb", label: "SVB Payroll", group: "reconciliation", type: "Bank feed", lastTouched: "live", aggregate: true, children: ["txn-9910", "txn-9911", "txn-9912"] },

  // Close
  { id: "batch-sept-close", label: "September Close", group: "close", type: "Journal batch", lastTouched: "2026-09-19", aggregate: true, children: ["je-inventory-reserve", "je-payroll", "je-marketing-accrual"] },
  { id: "rollforward-ppe", label: "PP&E Rollforward", group: "close", type: "Reference data", lastTouched: "2026-09-14", aggregate: true, children: ["ppe-schedule"] },

  // Forecast
  { id: "model-13wk", label: "13-Week Cash Forecast", group: "forecast", type: "Model", lastTouched: "live", aggregate: true, children: ["ref-ar-aging", "ref-ap-aging", "ref-bank-balance"] },
  { id: "ref-covenant", label: "Covenant Terms", group: "forecast", type: "Reference data", lastTouched: "2026-06-01" },

  // Audit
  { id: "evidence-margin-aug", label: "August Margin Review", group: "audit", type: "Evidence bundle", lastTouched: "2026-09-18", aggregate: true, children: ["dataset-cogs-ledger", "je-inventory-reserve", "je-freight-accrual"] },
  { id: "log-immutable", label: "Immutable Activity Log", group: "audit", type: "Log", lastTouched: "live" },
];

export const AGGREGATE_DATASET: GraphDataset = {
  nodes: [...agents, ...aggregates],
  edges: [
    { source: "agent-ap", target: "vendor-meridian" },
    { source: "agent-ap", target: "vendor-halberd" },
    { source: "agent-ap", target: "vendor-cobalt" },
    { source: "agent-ap", target: "vendor-northline" },
    { source: "agent-ap", target: "vendor-ferro" },
    { source: "agent-ap", target: "vendor-aldergate" },

    { source: "agent-ar", target: "cust-unionbay" },
    { source: "agent-ar", target: "cust-delacroix" },
    { source: "agent-ar", target: "cust-cormorant" },
    { source: "agent-ar", target: "cust-pemberton" },

    { source: "agent-recon", target: "bank-chase" },
    { source: "agent-recon", target: "bank-stripe" },
    { source: "agent-recon", target: "bank-svb" },

    { source: "agent-close", target: "batch-sept-close" },
    { source: "agent-close", target: "rollforward-ppe" },

    { source: "agent-forecast", target: "model-13wk" },
    { source: "model-13wk", target: "ref-covenant" },

    { source: "agent-audit", target: "evidence-margin-aug" },
    { source: "agent-audit", target: "log-immutable" },

    // cross-module references
    { source: "model-13wk", target: "cust-unionbay" },
    { source: "model-13wk", target: "vendor-meridian" },
    { source: "model-13wk", target: "bank-chase" },
    { source: "evidence-margin-aug", target: "batch-sept-close" },
    { source: "evidence-margin-aug", target: "bank-stripe" },
    { source: "batch-sept-close", target: "bank-stripe" },
    { source: "log-immutable", target: "agent-ap" },
    { source: "log-immutable", target: "agent-ar" },
    { source: "log-immutable", target: "agent-recon" },
    { source: "log-immutable", target: "agent-close" },
  ],
};

export const EXPANSIONS: Record<string, GraphDataset> = {
  "vendor-meridian": {
    nodes: [
      { id: "inv-4483", label: "Invoice #4483", group: "payables", type: "Invoice", lastTouched: "2026-09-19" },
      { id: "inv-4484", label: "Invoice #4484", group: "payables", type: "Invoice", lastTouched: "2026-09-19" },
      { id: "po-88213", label: "PO-88213", group: "payables", type: "Purchase order", lastTouched: "2026-08-20" },
      { id: "po-88240", label: "PO-88240", group: "payables", type: "Purchase order", lastTouched: "2026-08-22" },
    ],
    edges: [
      { source: "vendor-meridian", target: "inv-4483" },
      { source: "vendor-meridian", target: "inv-4484" },
      { source: "vendor-meridian", target: "po-88213" },
      { source: "vendor-meridian", target: "po-88240" },
      { source: "inv-4483", target: "po-88213" },
      { source: "inv-4484", target: "po-88240" },
      { source: "agent-ap", target: "inv-4483" },
      { source: "agent-ap", target: "inv-4484" },
    ],
  },
  "vendor-halberd": {
    nodes: [
      { id: "inv-4471", label: "Invoice #4471", group: "payables", type: "Invoice", lastTouched: "2026-09-19" },
      { id: "vendor-record-8842", label: "Vendor record v-8842", group: "payables", type: "Reference data", lastTouched: "2026-09-18" },
    ],
    edges: [
      { source: "vendor-halberd", target: "inv-4471" },
      { source: "vendor-halberd", target: "vendor-record-8842" },
      { source: "inv-4471", target: "vendor-record-8842" },
      { source: "agent-ap", target: "inv-4471" },
    ],
  },
  "vendor-cobalt": {
    nodes: [
      { id: "inv-2210", label: "Invoice #2210", group: "payables", type: "Invoice", lastTouched: "2026-09-16" },
      { id: "inv-2198", label: "Invoice #2198", group: "payables", type: "Invoice", lastTouched: "2026-09-08" },
    ],
    edges: [
      { source: "vendor-cobalt", target: "inv-2210" },
      { source: "vendor-cobalt", target: "inv-2198" },
      { source: "agent-ap", target: "inv-2210" },
    ],
  },
  "vendor-northline": {
    nodes: [
      { id: "inv-7790-ap", label: "Invoice #7790 (AP)", group: "payables", type: "Invoice", lastTouched: "2026-09-17" },
      { id: "contract-nf2026", label: "Contract NF-2026-03", group: "payables", type: "Reference data", lastTouched: "2026-03-01" },
    ],
    edges: [
      { source: "vendor-northline", target: "inv-7790-ap" },
      { source: "vendor-northline", target: "contract-nf2026" },
      { source: "inv-7790-ap", target: "contract-nf2026" },
    ],
  },
  "vendor-ferro": {
    nodes: [{ id: "inv-661", label: "Invoice #661", group: "payables", type: "Invoice", lastTouched: "2026-09-12" }],
    edges: [{ source: "vendor-ferro", target: "inv-661" }],
  },
  "vendor-aldergate": {
    nodes: [{ id: "inv-5541", label: "Invoice #5541", group: "payables", type: "Invoice", lastTouched: "2026-09-11" }],
    edges: [{ source: "vendor-aldergate", target: "inv-5541" }],
  },
  "cust-unionbay": {
    nodes: [
      { id: "inv-7710", label: "Invoice #7710", group: "receivables", type: "Invoice", lastTouched: "2026-07-29" },
      { id: "inv-7742", label: "Invoice #7742", group: "receivables", type: "Invoice", lastTouched: "2026-08-03" },
      { id: "inv-7761", label: "Invoice #7761", group: "receivables", type: "Invoice", lastTouched: "2026-08-05" },
      { id: "reminder-log-unionbay", label: "Reminder log", group: "receivables", type: "Log", lastTouched: "2026-09-17" },
    ],
    edges: [
      { source: "cust-unionbay", target: "inv-7710" },
      { source: "cust-unionbay", target: "inv-7742" },
      { source: "cust-unionbay", target: "inv-7761" },
      { source: "cust-unionbay", target: "reminder-log-unionbay" },
      { source: "agent-ar", target: "reminder-log-unionbay" },
    ],
  },
  "cust-delacroix": {
    nodes: [{ id: "inv-7701", label: "Invoice #7701", group: "receivables", type: "Invoice", lastTouched: "2026-09-07" }],
    edges: [{ source: "cust-delacroix", target: "inv-7701" }],
  },
  "cust-cormorant": {
    nodes: [{ id: "risk-score-cormorant", label: "Risk score history", group: "receivables", type: "Reference data", lastTouched: "2026-09-15" }],
    edges: [{ source: "cust-cormorant", target: "risk-score-cormorant" }],
  },
  "cust-pemberton": {
    nodes: [{ id: "inv-7803", label: "Invoice #7803", group: "receivables", type: "Invoice", lastTouched: "2026-09-10" }],
    edges: [{ source: "cust-pemberton", target: "inv-7803" }],
  },
  "bank-chase": {
    nodes: [
      { id: "txn-4471", label: "Txn #4471", group: "reconciliation", type: "Transaction", lastTouched: "2026-09-19" },
      { id: "txn-4472", label: "Txn #4472", group: "reconciliation", type: "Transaction", lastTouched: "2026-09-19" },
      { id: "txn-4473", label: "Txn #4473", group: "reconciliation", type: "Transaction", lastTouched: "2026-09-18" },
    ],
    edges: [
      { source: "bank-chase", target: "txn-4471" },
      { source: "bank-chase", target: "txn-4472" },
      { source: "bank-chase", target: "txn-4473" },
    ],
  },
  "bank-stripe": {
    nodes: [
      { id: "fee-schedule-stripe", label: "Stripe fee schedule", group: "reconciliation", type: "Reference data", lastTouched: "2026-09-08" },
      { id: "je-stripe-trueup", label: "JE — Stripe fee true-up", group: "reconciliation", type: "Journal entry", lastTouched: "2026-09-19" },
    ],
    edges: [
      { source: "bank-stripe", target: "fee-schedule-stripe" },
      { source: "bank-stripe", target: "je-stripe-trueup" },
      { source: "je-stripe-trueup", target: "batch-sept-close" },
      { source: "agent-recon", target: "je-stripe-trueup" },
    ],
  },
  "bank-svb": {
    nodes: [
      { id: "txn-9910", label: "Txn #9910", group: "reconciliation", type: "Transaction", lastTouched: "2026-09-15" },
      { id: "txn-9911", label: "Txn #9911", group: "reconciliation", type: "Transaction", lastTouched: "2026-09-16" },
      { id: "txn-9912", label: "Txn #9912", group: "reconciliation", type: "Transaction", lastTouched: "2026-09-17" },
    ],
    edges: [
      { source: "bank-svb", target: "txn-9910" },
      { source: "bank-svb", target: "txn-9911" },
      { source: "bank-svb", target: "txn-9912" },
    ],
  },
  "batch-sept-close": {
    nodes: [
      { id: "je-inventory-reserve", label: "JE — Inventory reserve", group: "close", type: "Journal entry", lastTouched: "2026-09-18" },
      { id: "je-payroll", label: "JE — Payroll accrual", group: "close", type: "Journal entry", lastTouched: "2026-09-19" },
      { id: "je-marketing-accrual", label: "JE — Marketing accrual", group: "close", type: "Journal entry", lastTouched: "2026-09-19" },
    ],
    edges: [
      { source: "batch-sept-close", target: "je-inventory-reserve" },
      { source: "batch-sept-close", target: "je-payroll" },
      { source: "batch-sept-close", target: "je-marketing-accrual" },
      { source: "agent-close", target: "je-inventory-reserve" },
      { source: "je-inventory-reserve", target: "evidence-margin-aug" },
    ],
  },
  "rollforward-ppe": {
    nodes: [{ id: "ppe-schedule", label: "PP&E depreciation schedule", group: "close", type: "Reference data", lastTouched: "2026-09-14" }],
    edges: [{ source: "rollforward-ppe", target: "ppe-schedule" }],
  },
  "model-13wk": {
    nodes: [
      { id: "ref-ar-aging", label: "AR aging feed", group: "forecast", type: "Reference data", lastTouched: "live" },
      { id: "ref-ap-aging", label: "AP aging feed", group: "forecast", type: "Reference data", lastTouched: "live" },
      { id: "ref-bank-balance", label: "Bank balance feed", group: "forecast", type: "Reference data", lastTouched: "live" },
    ],
    edges: [
      { source: "model-13wk", target: "ref-ar-aging" },
      { source: "model-13wk", target: "ref-ap-aging" },
      { source: "model-13wk", target: "ref-bank-balance" },
      { source: "ref-ar-aging", target: "cust-unionbay" },
      { source: "ref-ap-aging", target: "vendor-meridian" },
      { source: "ref-bank-balance", target: "bank-chase" },
    ],
  },
  "evidence-margin-aug": {
    nodes: [
      { id: "dataset-cogs-ledger", label: "cogs_ledger_2026_09.csv", group: "audit", type: "Reference data", lastTouched: "2026-09-18" },
      { id: "je-freight-accrual", label: "JE — Freight rate accrual", group: "audit", type: "Journal entry", lastTouched: "2026-09-01" },
    ],
    edges: [
      { source: "evidence-margin-aug", target: "dataset-cogs-ledger" },
      { source: "evidence-margin-aug", target: "je-inventory-reserve" },
      { source: "evidence-margin-aug", target: "je-freight-accrual" },
      { source: "agent-audit", target: "dataset-cogs-ledger" },
    ],
  },
};
