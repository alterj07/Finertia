// Pure data-shaping helpers for the Financial Operations page: map the
// existing /api/dashboard/* payloads (same shapes the old Payables/
// Receivables/Reconciliation/Close/Audit screens consumed) into the
// row types the new tables render, padding with realistic sample rows
// (drawn from the seeded dataset's own vendors/customers) when live
// findings haven't been generated yet.
import type { ActionTag, ChecklistItemData, LedgerRowData } from "@/lib/types";
import type { Tone } from "@/components/shared/tone-badge";

export type TabKey = "ap-ar" | "reconciliation" | "close" | "audit" | "forecast";

export const TONE_BY_TAG: Record<ActionTag, Tone> = {
  flag: "critical",
  review: "warning",
  auto: "positive",
};

export const LABEL_BY_TAG: Record<ActionTag, string> = {
  flag: "Flagged",
  review: "Needs review",
  auto: "Cleared",
};

// ---- shapes coming back from the existing dashboard endpoints -----------

export interface PayablesData {
  queue: LedgerRowData[];
  auto_paid: { count: number | string; total: string; week_of: string; on_hold: number | string };
  auto_paid_ledger: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export interface ReceivablesData {
  aging: { label: string; value: string }[];
  collections: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export interface ReconciliationData {
  accounts: LedgerRowData[];
  findings: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export interface CloseData {
  checklist: ChecklistItemData[];
  days_remaining: string;
  variance_flags: LedgerRowData[];
  needs_run?: boolean;
  run_request?: string;
}

export interface ForecastWeek {
  label: string;
  inflows: number;
  outflows: number;
  ending: number;
}

export interface ForecastData {
  opening: number;
  weeks: ForecastWeek[];
  unscheduled: { label: string; amount: string; reason: string }[];
  assumptions: string[];
  covenant: string;
  needs_run?: boolean;
  run_request?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorName: string;
  action: string;
  amount: string | null;
}

export interface AuditData {
  log: AuditEntry[];
  needs_run?: boolean;
  run_request?: string;
}

// ---- small parsers over the backend's known string templates ------------
// (see backend/app/dashboard/screens.py — these are the exact f-strings
// each row's `primary`/`secondary` are built from)

function splitEmDash(s: string): [string, string] {
  const i = s.indexOf(" — ");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 3)];
}

function firstMatch(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1].trim() : null;
}

/** Best-effort vendor name out of an AP finding title, e.g.
 * "INV-7781 (Brightline Logistics) posted 2x" or
 * "Vantage Software remit-to changed from …". Not every title carries a
 * vendor — e.g. "KL-2026-031 booked 5,480.00 vs invoice 4,850.00
 * (+630.00)" has a parenthetical that's a number, not a name — so only
 * accept a parenthetical that actually starts with a letter. */
function vendorFromTitle(title: string): string | null {
  return firstMatch(title, /\(([A-Za-z][^,)]*)/) ?? firstMatch(title, /^(.+?) remit-to changed/);
}

// ---- row types the tables render -----------------------------------------

export interface ApRow {
  id: string;
  vendor: string;
  invoice: string;
  due: string;
  amount: string;
  status: string;
  tone: Tone;
  href?: string;
  mock?: boolean;
}

export interface ArRow {
  id: string;
  customer: string;
  invoice: string;
  due: string;
  amount: string;
  status: string;
  tone: Tone;
  href?: string;
  mock?: boolean;
}

export interface ReconRow {
  id: string;
  transaction: string;
  account: string;
  amount: string;
  matchStatus: string;
  tone: Tone;
  confidence: string;
  href?: string;
}

export interface CloseRow {
  id: string;
  task: string;
  owner: string;
  due: string;
  status: string;
  tone: Tone;
}

export interface AuditRow {
  id: string;
  finding: string;
  control: string;
  risk: string;
  tone: Tone;
  status: string;
  href?: string;
}

export interface ForecastRow {
  id: string;
  scenario: string;
  period: string;
  amount: string;
  variance: string;
  tone: Tone;
  status: string;
}

const money = (n: number) =>
  n < 0
    ? `-$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// ---- realistic sample rows, seeded from the dataset's own parties --------
// (Northwind Robotics' actual vendors/customers — see data/vendor_invoices
// .jsonl and data/bank_transactions.csv — so padding rows read as part of
// the same company, not generic placeholder text)

const MOCK_AP: ApRow[] = [
  { id: "mock-ap-1", vendor: "Keystone Legal LLP", invoice: "INV-2213", due: "2026-04-08", amount: money(4200), status: "Needs review", tone: "warning", mock: true },
  { id: "mock-ap-2", vendor: "Metro Office Supply", invoice: "INV-2219", due: "2026-04-11", amount: money(860), status: "Scheduled", tone: "info", mock: true },
  { id: "mock-ap-3", vendor: "Northstar Staffing", invoice: "INV-2225", due: "2026-04-14", amount: money(12750), status: "Cleared", tone: "positive", mock: true },
  { id: "mock-ap-4", vendor: "Pinecrest Properties", invoice: "INV-2231", due: "2026-04-01", amount: money(9600), status: "Flagged", tone: "critical", mock: true },
];

const MOCK_AR: ArRow[] = [
  { id: "mock-ar-1", customer: "Apex Manufacturing", invoice: "AR-1051", due: "2026-04-05", amount: money(28400), status: "Current", tone: "info", mock: true },
  { id: "mock-ar-2", customer: "Bluewater Marine", invoice: "AR-1054", due: "2026-04-09", amount: money(15200), status: "Current", tone: "info", mock: true },
  { id: "mock-ar-3", customer: "Redwood Health", invoice: "AR-1058", due: "2026-03-22", amount: money(7300), status: "Overdue", tone: "critical", mock: true },
  { id: "mock-ar-4", customer: "Stratos Aero", invoice: "AR-1061", due: "2026-04-18", amount: money(19850), status: "Current", tone: "info", mock: true },
];

// ---- builders --------------------------------------------------------------

export function buildApRows(data: PayablesData | null): ApRow[] {
  const rows: ApRow[] = [];
  for (const r of data?.auto_paid_ledger ?? []) {
    const [invoice, vendor] = splitEmDash(r.primary);
    const due = firstMatch(r.secondary ?? "", /^due (\S+)/) ?? "N/A";
    rows.push({
      id: r.id,
      vendor: vendor || "—",
      invoice,
      due,
      amount: r.amount ?? "N/A",
      status: "Auto-paid",
      tone: "positive",
      href: r.href,
    });
  }
  for (const r of data?.queue ?? []) {
    const tag = r.tag ?? "review";
    rows.push({
      id: r.id,
      vendor: vendorFromTitle(r.primary) ?? "—",
      invoice: r.id,
      due: "N/A",
      amount: r.amount ?? "N/A",
      status: LABEL_BY_TAG[tag],
      tone: TONE_BY_TAG[tag],
      href: r.href,
    });
  }
  if (rows.length < 4) rows.push(...MOCK_AP.slice(0, 4 - rows.length));
  return rows.slice(0, 8);
}

export function buildArRows(data: ReceivablesData | null): ArRow[] {
  const rows: ArRow[] = [];
  for (const r of data?.collections ?? []) {
    const tag = r.tag ?? "review";
    const isStructured = r.id.startsWith("ar-");
    const [invoice, customer] = isStructured ? splitEmDash(r.primary) : [r.id.split(":").at(-1) ?? r.id, "—"];
    // Structured aging rows carry "{status} · {days}d past due" in secondary;
    // finding-derived rows carry "{agent} · {code}" instead — never parse a
    // status word out of that second shape, it isn't one.
    const status = isStructured
      ? (firstMatch(r.secondary ?? "", /^(\S+)\s*·/) ?? LABEL_BY_TAG[tag])
      : LABEL_BY_TAG[tag];
    const promised = firstMatch(r.secondary ?? "", /promised (\d{4}-\d{2}-\d{2})/);
    const daysPastDue = firstMatch(r.secondary ?? "", /(\d+)d past due/);
    const due = promised
      ? `promised ${promised}`
      : daysPastDue
        ? `${daysPastDue}d past due`
        : "N/A";
    rows.push({
      id: r.id,
      customer: isStructured ? customer || "—" : vendorFromTitle(r.primary) ?? "—",
      invoice,
      due,
      amount: r.amount ?? "N/A",
      status: status[0].toUpperCase() + status.slice(1),
      tone: TONE_BY_TAG[tag],
      href: r.href,
    });
  }
  if (rows.length < 4) rows.push(...MOCK_AR.slice(0, 4 - rows.length));
  return rows.slice(0, 8);
}

export function buildReconRows(data: ReconciliationData | null): ReconRow[] {
  const rows: ReconRow[] = [];
  for (const r of data?.accounts ?? []) {
    const unexplained = /(\d+) unexplained/.exec(r.secondary ?? "");
    const clean = unexplained ? unexplained[1] === "0" : !/unexplained/.test(r.secondary ?? "");
    rows.push({
      id: r.id,
      transaction: r.primary,
      account: r.primary,
      amount: r.amount ?? "N/A",
      matchStatus: clean ? "Matched" : "Exception",
      tone: clean ? "positive" : "critical",
      confidence: "N/A",
      href: r.detail?.actions?.[0]?.href,
    });
  }
  for (const r of data?.findings ?? []) {
    const tag = r.tag ?? "review";
    rows.push({
      id: r.id,
      transaction: r.primary,
      account: r.secondary?.split(" · ")[0] ?? "—",
      amount: r.amount ?? "N/A",
      matchStatus: LABEL_BY_TAG[tag],
      tone: TONE_BY_TAG[tag],
      confidence: "N/A",
      href: r.href,
    });
  }
  return rows;
}

const CLOSE_TONE: Record<ChecklistItemData["status"], Tone> = {
  done: "positive",
  "in-progress": "warning",
  blocked: "critical",
  todo: "neutral",
};
const CLOSE_LABEL: Record<ChecklistItemData["status"], string> = {
  done: "Done",
  "in-progress": "In progress",
  blocked: "Blocked",
  todo: "To do",
};

export function buildCloseRows(data: CloseData | null): CloseRow[] {
  return (data?.checklist ?? []).map((item) => ({
    id: item.id,
    task: item.label,
    owner: item.owner,
    due: "N/A",
    status: CLOSE_LABEL[item.status],
    tone: CLOSE_TONE[item.status],
  }));
}

export function buildAuditRows(data: AuditData | null): AuditRow[] {
  return (data?.log ?? []).map((entry) => {
    const isControl = entry.actor !== "system";
    return {
      id: entry.id,
      finding: entry.action,
      control: isControl ? "Vendor bank-detail change" : "Orchestration run",
      risk: isControl ? "High" : "Info",
      tone: isControl ? "critical" : "info",
      status: isControl ? "Needs review" : "Logged",
      href: `/graph?node=${encodeURIComponent(entry.id)}`,
    };
  });
}

export function buildForecastRows(data: ForecastData | null): ForecastRow[] {
  if (!data) return [];
  const rows: ForecastRow[] = data.weeks.map((w, i) => {
    const net = w.inflows - w.outflows;
    return {
      id: `week-${i}`,
      scenario: "Base",
      period: w.label,
      amount: money(w.ending),
      variance: (net >= 0 ? "+" : "-") + money(Math.abs(net)).replace("-", ""),
      tone: net >= 0 ? "forecast" : "critical",
      status: net >= 0 ? "On track" : "Watch",
    };
  });
  for (const u of data.unscheduled) {
    rows.push({
      id: `unscheduled-${u.label}`,
      scenario: "Unscheduled",
      period: u.label,
      amount: u.amount,
      variance: "—",
      tone: "warning",
      status: u.reason,
    });
  }
  return rows;
}

// ---- Work Queue: top items across AP/AR, reconciliation and close --------

export interface WorkQueueItem {
  id: string;
  task: string;
  workflow: string;
  status: string;
  tone: Tone;
  tab: TabKey;
  action: string;
}

const MOCK_QUEUE: WorkQueueItem[] = [
  {
    id: "wq-mock-1",
    task: "Verify Vantage Software's new remit-to account",
    workflow: "AP / AR",
    status: "Flagged",
    tone: "critical",
    tab: "ap-ar",
    action: "Review",
  },
  {
    id: "wq-mock-2",
    task: "Confirm Q1 bank reconciliation on Operating ****0042",
    workflow: "Reconciliation",
    status: "Needs review",
    tone: "warning",
    tab: "reconciliation",
    action: "Reconcile",
  },
  {
    id: "wq-mock-3",
    task: "Management sign-off on the Q1 close",
    workflow: "Close",
    status: "To do",
    tone: "neutral",
    tab: "close",
    action: "Sign off",
  },
];

const QUEUE_SEVERITY: Record<Tone, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  neutral: 3,
  positive: 4,
  forecast: 4,
};

export function buildWorkQueue(
  payables: PayablesData | null,
  receivables: ReceivablesData | null,
  reconciliation: ReconciliationData | null,
  close: CloseData | null,
): WorkQueueItem[] {
  const candidates: WorkQueueItem[] = [];

  for (const r of payables?.queue ?? []) {
    const tag = r.tag ?? "review";
    candidates.push({
      id: r.id,
      task: r.primary,
      workflow: "AP / AR",
      status: LABEL_BY_TAG[tag],
      tone: TONE_BY_TAG[tag],
      tab: "ap-ar",
      action: "Review",
    });
  }
  for (const r of receivables?.collections ?? []) {
    if (r.tag !== "flag" && r.tag !== "review") continue;
    candidates.push({
      id: r.id,
      task: r.primary,
      workflow: "AP / AR",
      status: LABEL_BY_TAG[r.tag],
      tone: TONE_BY_TAG[r.tag],
      tab: "ap-ar",
      action: "Review",
    });
  }
  for (const r of reconciliation?.findings ?? []) {
    const tag = r.tag ?? "review";
    candidates.push({
      id: r.id,
      task: r.primary,
      workflow: "Reconciliation",
      status: LABEL_BY_TAG[tag],
      tone: TONE_BY_TAG[tag],
      tab: "reconciliation",
      action: "Reconcile",
    });
  }
  const nextCloseTask = close?.checklist.find((c) => c.status === "blocked" || c.status === "in-progress" || c.status === "todo");
  if (nextCloseTask) {
    candidates.push({
      id: nextCloseTask.id,
      task: nextCloseTask.label,
      workflow: "Close",
      status: CLOSE_LABEL[nextCloseTask.status],
      tone: CLOSE_TONE[nextCloseTask.status],
      tab: "close",
      action: "Open",
    });
  }

  candidates.sort((a, b) => QUEUE_SEVERITY[a.tone] - QUEUE_SEVERITY[b.tone]);
  const top = candidates.slice(0, 3);
  if (top.length < 3) top.push(...MOCK_QUEUE.slice(0, 3 - top.length));
  return top;
}
