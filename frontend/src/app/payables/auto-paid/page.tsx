import Link from "next/link";
import { Ledger } from "@/components/shared/ledger";
import { SectionBlock } from "@/components/shared/section-block";
import { PAYABLES_AUTO_PAID_LEDGER, PAYABLES_AUTO_PAID_SUMMARY } from "@/lib/mock/payables";

export default function AutoPaidLedger() {
  return (
    <div>
      <Link href="/payables" className="text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
        ← Back to Payables
      </Link>
      <SectionBlock title={`Auto-paid — week of ${PAYABLES_AUTO_PAID_SUMMARY.weekOf}`}>
        <p className="mb-3 text-xs text-ink-soft">
          {PAYABLES_AUTO_PAID_SUMMARY.count} invoices, {PAYABLES_AUTO_PAID_SUMMARY.total} total. Every
          row here matched an open purchase order within tolerance, came from a vendor with an
          established payment history, and was under the $5,000 auto-pay ceiling.
        </p>
        <Ledger rows={PAYABLES_AUTO_PAID_LEDGER} />
      </SectionBlock>
    </div>
  );
}
