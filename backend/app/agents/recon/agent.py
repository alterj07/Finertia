"""Cash & Reconciliation agent: bank-to-book reconciliation for a period.

Rule-based port of the lab's CashReconAgent.reconcile — same 4 passes,
same leftovers (unrecorded bank items, timing items), same summary.
"""

from collections import Counter
from typing import Any

from app.agents.base import Agent, AgentContext, AgentResult
from app.agents.recon.models import ReconSummary
from app.agents.recon.rules import MatchState, RuleBook


class CashReconAgent(Agent):
    name = "Cash & Reconciliation"

    def run(
        self,
        ctx: AgentContext,
        start: str = "2026-01-01",
        end: str = "2026-03-31",
        **_: Any,
    ) -> AgentResult:
        lake = ctx.lake
        bank = lake.bank_between(start, end)
        self.trace("bank feed for period", rows=len(bank))
        book = lake.gl_lines("1000", start=start, end=end, exclude_je=("JE-1000",))
        self.trace("GL cash lines for period (excl. opening JE-1000)", rows=len(book))

        rulebook = RuleBook.build(ctx.feedback.for_agent(self.name))
        state = MatchState(bank=bank, book=book, ctx=ctx, params=rulebook.params)
        rulebook.run(state)
        for kw in state.pending_findings:
            self.finding(ctx, **kw)
        matches = state.matches

        # ---- leftovers
        bank_only = [b for b in bank if b.txn_id not in state.matched_bank]
        book_only = [g for g in book if g.je_id not in state.matched_book]

        unrecorded = [b for b in bank_only if b.txn_type in ("FEE", "INTEREST")]
        if unrecorded:
            net = round(sum(b.amount for b in unrecorded), 2)
            self.finding(
                ctx,
                code="UNRECORDED_BANK_ITEMS",
                key=str(end)[:7],
                amount=net,
                severity="low",
                title=f"{len(unrecorded)} bank-only items not in GL (net ${net:,.2f})",
                detail="; ".join(
                    f"{b.posted_date} {b.description} {b.amount:,.2f}" for b in unrecorded
                ),
                entities=[b.txn_id for b in unrecorded],
                proposed_je=dict(
                    memo="Record bank fees/interest",
                    lines=[
                        (
                            "6600" if b.txn_type == "FEE" else "7000",
                            max(-b.amount, 0),
                            max(b.amount, 0),
                        )
                        for b in unrecorded
                    ]
                    + [("1000", max(net, 0), max(-net, 0))],
                ),
            )

        os_checks = [g for g in book_only if g.amount < 0 and g.check_number]
        dits = [g for g in book_only if g.amount > 0]
        if os_checks or dits:
            ev = []
            for g in dits:
                ev += [m.file for m in lake.emails_with_ref(g.doc_ref_norm)]
            self.finding(
                ctx,
                code="TIMING_ITEMS",
                key=" / ".join(
                    [f"CHECK {g.check_number}" for g in os_checks]
                    + [g.doc_ref or g.je_id for g in dits]
                ),
                severity="info",
                amount=None,
                title=f"{len(os_checks)} outstanding check(s), "
                f"{len(dits)} deposit(s) in transit at {end}",
                detail="; ".join(
                    f"{g.posting_date} {g.memo} {g.amount:,.2f}" for g in os_checks + dits
                )
                + ". Timing only: verify they clear in the first days of next month.",
                entities=[g.je_id for g in os_checks + dits],
                evidence=ev,
            )

        other_bank = [b for b in bank_only if b not in unrecorded]
        other_book = [g for g in book_only if g not in os_checks + dits]

        opening = bank[0].running_balance - bank[0].amount
        bank_end = bank[-1].running_balance
        book_end = lake.gl_cash_balance(end)
        self.trace("book cash balance", balance=book_end)
        adj_bank = round(bank_end + sum(g.amount for g in os_checks + dits), 2)
        book_by_je = {g.je_id: g for g in book}
        bank_by_id = {b.txn_id: b for b in bank}
        fx = sum(
            round(bank_by_id[tid].amount - book_by_je[m.book[0]].amount, 2)
            for m in matches
            if m.method == "tolerance"
            for tid in m.bank
        )
        adj_book = round(book_end + sum(b.amount for b in unrecorded) + fx, 2)
        summary = ReconSummary(
            opening=opening,
            bank_balance=bank_end,
            book_balance=book_end,
            adjusted_bank=adj_bank,
            adjusted_book=adj_book,
            difference=round(adj_bank - adj_book, 2),
            matched=dict(Counter(m.method for m in matches)),
            unexplained_bank=[b.txn_id for b in other_bank],
            unexplained_book=[g.je_id for g in other_book],
        )
        self.finding(
            ctx,
            code="RECON_SUMMARY",
            key=str(end),
            amount=summary.difference,
            severity="info" if summary.difference == 0 else "high",
            title=f"Bank rec {end}: adjusted bank ${adj_bank:,.2f} "
            f"vs adjusted book ${adj_book:,.2f}",
            detail=f"{sum(summary.matched.values())} matches {summary.matched}; "
            f"unexplained bank {other_bank and len(other_bank)}, "
            f"book {other_book and len(other_book)}",
            data=summary.to_dict(),
        )
        return AgentResult(
            agent=self.name,
            findings=[f for f in ctx.memory.findings if f.agent == self.name],
            summary={**summary.to_dict(), "matches": [m.model_dump() for m in matches]},
            trace=self._trace,
        )
