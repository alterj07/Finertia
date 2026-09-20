"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { SectionBlock } from "@/components/shared/section-block";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { DashboardGate } from "@/components/shared/dashboard-gate";
import { Ledger } from "@/components/shared/ledger";
import { ToneBadge, type Tone } from "@/components/shared/tone-badge";
import { DealsScreen } from "@/components/screens/deals";
import { useDashboard } from "@/lib/use-dashboard";
import { useAppStore } from "@/store/app-store";
import { useCopilotStore } from "@/store/copilot-store";
import {
  buildApRows,
  buildArRows,
  buildAuditRows,
  buildCloseRows,
  buildForecastRows,
  buildReconRows,
  buildWorkQueue,
  type ApRow,
  type ArRow,
  type AuditData,
  type AuditRow,
  type CloseData,
  type CloseRow,
  type ForecastData,
  type ForecastRow,
  type PayablesData,
  type ReceivablesData,
  type ReconciliationData,
  type ReconRow,
  type TabKey,
} from "@/lib/financial-ops";

const TABS: { key: TabKey; label: string }[] = [
  { key: "ap-ar", label: "AP / AR" },
  { key: "reconciliation", label: "Reconciliation" },
  { key: "close", label: "Close" },
  { key: "audit", label: "Audit" },
  { key: "forecast", label: "Forecast" },
];

function useAskCopilot() {
  const setPendingDraft = useCopilotStore((s) => s.setPendingDraft);
  const setCopilotOpen = useAppStore((s) => s.setCopilotOpen);
  return (question: string) => {
    setPendingDraft(question);
    setCopilotOpen(true);
  };
}

/** Every table's Action cell: a real link when the row has one (an existing
 * detail page or the graph), otherwise a copilot question grounded in the
 * memory graph — never a dead control. */
function RowAction({ href, label, question, ask }: { href?: string; label: string; question: string; ask: (q: string) => void }) {
  const className =
    "inline-flex items-center gap-1 rounded-sm border border-rule px-1.5 py-1 text-xs text-ink whitespace-nowrap hover:border-ink-soft";
  if (href) {
    return (
      <Link href={href} className={className} onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ask(question);
      }}
      className={className}
    >
      Ask
    </button>
  );
}

// ---------------------------------------------------------------- Work Queue

interface QueueTableRow {
  id: string;
  task: string;
  workflow: string;
  status: string;
  tone: Tone;
}

function WorkQueue({
  payables,
  receivables,
  reconciliation,
  close,
  onOpen,
}: {
  payables: PayablesData | null;
  receivables: ReceivablesData | null;
  reconciliation: ReconciliationData | null;
  close: CloseData | null;
  onOpen: (tab: TabKey) => void;
}) {
  const items = useMemo(
    () => buildWorkQueue(payables, receivables, reconciliation, close),
    [payables, receivables, reconciliation, close],
  );
  const tabByRow = useMemo(() => new Map(items.map((i) => [i.id, i.tab])), [items]);

  const columns: DataTableColumn<QueueTableRow>[] = [
    { key: "task", header: "Task", render: (r) => <span className="line-clamp-1">{r.task}</span> },
    {
      key: "workflow",
      header: "Workflow",
      hideOnMobile: true,
      render: (r) => <span className="font-mono text-xs text-ink-soft">{r.workflow}</span>,
    },
    { key: "status", header: "Status", render: (r) => <ToneBadge label={r.status} tone={r.tone} /> },
    {
      key: "action",
      header: "",
      align: "right",
      render: () => <ChevronRight size={15} className="ml-auto text-ink-soft" aria-hidden />,
    },
  ];

  return (
    <SectionBlock title="Work Queue">
      <DataTable
        columns={columns}
        rows={items}
        onRowClick={(r) => onOpen(tabByRow.get(r.id) ?? "ap-ar")}
      />
    </SectionBlock>
  );
}

// -------------------------------------------------------------------- AP/AR

function ApArPanel() {
  const payables = useDashboard<PayablesData>("payables");
  const receivables = useDashboard<ReceivablesData>("receivables");

  const apColumns: DataTableColumn<ApRow>[] = [
    { key: "vendor", header: "Vendor", render: (r) => r.vendor },
    { key: "due", header: "Due Date", hideOnMobile: true, render: (r) => <span className="font-mono text-xs text-ink-soft">{r.due}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-mono">{r.amount}</span> },
    { key: "status", header: "Status", render: (r) => <ToneBadge label={r.status} tone={r.tone} /> },
  ];

  const arColumns: DataTableColumn<ArRow>[] = [
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "due", header: "Due Date", hideOnMobile: true, render: (r) => <span className="font-mono text-xs text-ink-soft">{r.due}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-mono">{r.amount}</span> },
    { key: "status", header: "Status", render: (r) => <ToneBadge label={r.status} tone={r.tone} /> },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="min-w-0">
        <h3 className="mb-2.5 font-serif text-base text-ink">Accounts Payable</h3>
        <DashboardGate loading={payables.loading} error={payables.error} data={payables.data} onRan={payables.reload}>
          {(d) => <DataTable columns={apColumns} rows={buildApRows(d)} />}
        </DashboardGate>
      </div>
      <div className="min-w-0">
        <h3 className="mb-2.5 font-serif text-base text-ink">Accounts Receivable</h3>
        <DashboardGate loading={receivables.loading} error={receivables.error} data={receivables.data} onRan={receivables.reload}>
          {(d) => <DataTable columns={arColumns} rows={buildArRows(d)} />}
        </DashboardGate>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Reconciliation

function ReconciliationPanel() {
  const { data, loading, error, reload } = useDashboard<ReconciliationData>("reconciliation");
  const ask = useAskCopilot();

  const columns: DataTableColumn<ReconRow>[] = [
    { key: "transaction", header: "Transaction", render: (r) => r.transaction },
    { key: "account", header: "Account", hideOnMobile: true, render: (r) => <span className="text-ink-soft">{r.account}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-mono">{r.amount}</span> },
    { key: "matchStatus", header: "Match Status", render: (r) => <ToneBadge label={r.matchStatus} tone={r.tone} /> },
    { key: "confidence", header: "Confidence", hideOnMobile: true, render: (r) => <span className="font-mono text-xs text-ink-soft">{r.confidence}</span> },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (r) => <RowAction href={r.href} label="View" question={`Explain the reconciliation on ${r.transaction}`} ask={ask} />,
    },
  ];

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => <DataTable columns={columns} rows={buildReconRows(d)} emptyState="No reconciliation run yet — N/A" />}
    </DashboardGate>
  );
}

// -------------------------------------------------------------------- Close

function ClosePanel() {
  const { data, loading, error, reload } = useDashboard<CloseData>("close");

  const columns: DataTableColumn<CloseRow>[] = [
    { key: "task", header: "Task", render: (r) => r.task },
    { key: "owner", header: "Owner", render: (r) => <span className="font-mono text-xs text-ink-soft">{r.owner}</span> },
    { key: "due", header: "Due Date", hideOnMobile: true, render: (r) => <span className="font-mono text-xs text-ink-soft">{r.due}</span> },
    { key: "status", header: "Status", render: (r) => <ToneBadge label={r.status} tone={r.tone} /> },
  ];

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => (
        <div>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h3 className="font-serif text-base text-ink">Close checklist</h3>
            <span className="font-mono text-sm text-gold">{d.days_remaining} days remaining</span>
          </div>
          <DataTable columns={columns} rows={buildCloseRows(d)} />

          {d.variance_flags.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2.5 font-serif text-base text-ink">Proposed adjusting entries</h3>
              <Ledger rows={d.variance_flags} emptyState="No proposed entries — N/A" />
            </div>
          )}

          <div className="mt-8 border-t border-rule pt-6">
            <h3 className="mb-1 font-serif text-base text-ink">Inbox triage &amp; deal drafts</h3>
            <p className="mb-3 text-xs text-ink-soft">Preserved from the Deals agent — reads the inbox alongside the close.</p>
            <DealsScreen />
          </div>
        </div>
      )}
    </DashboardGate>
  );
}

// -------------------------------------------------------------------- Audit

function AuditPanel() {
  const { data, loading, error, reload } = useDashboard<AuditData>("audit");
  const ask = useAskCopilot();

  const columns: DataTableColumn<AuditRow>[] = [
    { key: "finding", header: "Finding", render: (r) => r.finding },
    { key: "control", header: "Control", hideOnMobile: true, render: (r) => <span className="text-ink-soft">{r.control}</span> },
    { key: "risk", header: "Risk / Severity", render: (r) => <ToneBadge label={r.risk} tone={r.tone} /> },
    { key: "status", header: "Status", render: (r) => <span className="text-ink-soft">{r.status}</span> },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (r) => <RowAction href={r.href} label="View in graph" question={`Explain: ${r.finding}`} ask={ask} />,
    },
  ];

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => <DataTable columns={columns} rows={buildAuditRows(d)} emptyState="No control signals yet — N/A" />}
    </DashboardGate>
  );
}

// ----------------------------------------------------------------- Forecast

function ForecastPanel() {
  const { data, loading, error, reload } = useDashboard<ForecastData>("forecast");
  const ask = useAskCopilot();

  const columns: DataTableColumn<ForecastRow>[] = [
    { key: "scenario", header: "Scenario", render: (r) => <span className="font-mono text-xs text-ink-soft">{r.scenario}</span> },
    { key: "period", header: "Period", render: (r) => r.period },
    { key: "amount", header: "Forecast Amount", align: "right", render: (r) => <span className="font-mono">{r.amount}</span> },
    { key: "variance", header: "Variance", align: "right", hideOnMobile: true, render: (r) => <span className="font-mono text-xs">{r.variance}</span> },
    { key: "status", header: "Status", render: (r) => <ToneBadge label={r.status} tone={r.tone} /> },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (r) => <RowAction label="Ask" question={`What's driving the forecast for ${r.period}?`} ask={ask} />,
    },
  ];

  return (
    <DashboardGate loading={loading} error={error} data={data} onRan={reload}>
      {(d) => <DataTable columns={columns} rows={buildForecastRows(d)} emptyState="No forecast yet — N/A" />}
    </DashboardGate>
  );
}

// -------------------------------------------------------------------- Page

function FinancialOperationsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = TABS.find((t) => t.key === searchParams.get("tab"))?.key ?? "ap-ar";
  const [tab, setTab] = useState<TabKey>(initial);

  const payables = useDashboard<PayablesData>("payables");
  const receivables = useDashboard<ReceivablesData>("receivables");
  const reconciliation = useDashboard<ReconciliationData>("reconciliation");
  const close = useDashboard<CloseData>("close");

  function goTo(next: TabKey) {
    setTab(next);
    router.replace(`/financial-operations?tab=${next}`, { scroll: false });
  }

  return (
    <div>
      <WorkQueue
        payables={payables.data}
        receivables={receivables.data}
        reconciliation={reconciliation.data}
        close={close.data}
        onOpen={goTo}
      />

      <Tabs.Root value={tab} onValueChange={(v) => goTo(v as TabKey)}>
        <Tabs.List className="flex w-full gap-1 px-1">
          {TABS.map((t) => (
            <Tabs.Tab
              key={t.key}
              value={t.key}
              className="flex-1 rounded-t-lg px-4 py-2.5 text-center text-sm whitespace-nowrap text-ink-soft transition-colors hover:text-ink aria-selected:bg-black/25 aria-selected:font-medium aria-selected:text-ink"
            >
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <div className="rounded-b-lg rounded-tr-lg bg-black/25 p-4">
          <Tabs.Panel value="ap-ar">
            <ApArPanel />
          </Tabs.Panel>
          <Tabs.Panel value="reconciliation">
            <ReconciliationPanel />
          </Tabs.Panel>
          <Tabs.Panel value="close">
            <ClosePanel />
          </Tabs.Panel>
          <Tabs.Panel value="audit">
            <AuditPanel />
          </Tabs.Panel>
          <Tabs.Panel value="forecast">
            <ForecastPanel />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </div>
  );
}

export function FinancialOperationsScreen() {
  return (
    <Suspense fallback={null}>
      <FinancialOperationsInner />
    </Suspense>
  );
}
