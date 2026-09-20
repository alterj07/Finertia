"""AP/AR agent: payables and receivables for a period, fully deterministic.

Every rule is a query over the shared memory graph (invoices merged by number,
journal entries linked to invoices, bank lines linked to both, emails and OCR'd
scans linked by reference) followed by an evidence check. Each finding carries
the node ids that prove it and, where it makes sense, a proposed journal entry.
No model calls: same data in, same findings out.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from app.agents.base import Agent, AgentContext, AgentResult
from app.memory.graph import MemoryGraph
from app.memory.models import Node

AGING_BUCKETS = ((0, "current"), (1, "1-30"), (31, "31-60"), (61, "61-90"), (91, "90+"))


def _d(s: str | None) -> date | None:
    return date.fromisoformat(str(s)[:10]) if s else None


def _bucket(days: int) -> str:
    label = "current"
    for lo, name in AGING_BUCKETS:
        if days >= lo:
            label = name
    return label


class APARAgent(Agent):
    name = "AP/AR"
    description = (
        "Accounts payable and receivable for a period: merges invoices across feeds and "
        "OCR'd scans, catches duplicate postings/payments, amount mismatches against the "
        "source invoice, unrecorded liabilities needing accrual, vendor remit-to changes, "
        "short-pay disputes, promises to pay; applies cash and produces the AR aging and "
        "the payment run."
    )
    capabilities = [
        "accounts payable",
        "accounts receivable",
        "ap",
        "ar",
        "invoices",
        "vendors",
        "customers",
        "duplicate",
        "aging",
        "collections",
        "payment run",
        "accrual",
        "ocr",
        "three-way match",
    ]
    params_schema = {
        "start": {"type": "string", "format": "date", "default": "2026-01-01"},
        "end": {"type": "string", "format": "date", "default": "2026-03-31"},
        "pay_within_days": {"type": "integer", "default": 7},
    }

    # ------------------------------------------------------------------ run
    def run(
        self,
        ctx: AgentContext,
        start: str = "2026-01-01",
        end: str = "2026-03-31",
        pay_within_days: int = 7,
        **_: Any,
    ) -> AgentResult:
        g = ctx.memory
        if not any(e.agent == "ingest" for e in g.edges):
            g.seed(ctx.lake)  # base layer missing (fresh memory): build it from the lake
            self.trace("seeded memory graph from data lake", nodes=len(g.nodes))
        as_of = _d(end)
        invoices = [
            n
            for n in g.nodes.values()
            if n.type == "invoice"
            and start
            <= str(n.props.get("invoice_date") or n.props.get("period") or "")
            <= end + "z"
        ]
        receivables = [
            n for n in g.nodes.values() if n.type == "ar_invoice" and not n.props.get("orphan")
        ]
        self.trace("vendor invoices in period", rows=len(invoices))
        self.trace("customer invoices", rows=len(receivables))

        held: set[str] = set()
        held |= self._duplicates(ctx, g, invoices)
        held |= self._amount_mismatches(ctx, g, invoices)
        held |= self._unrecorded_liabilities(ctx, g, invoices, end)
        held |= self._remit_changes(ctx, g)
        disputed = self._short_pays(ctx, g, receivables)
        promised = self._promises(ctx, g, receivables)
        applied = self._cash_application(g, receivables)
        aging = self._aging(ctx, g, receivables, as_of, disputed, promised)
        payment_run = self._payment_run(ctx, g, invoices, as_of, pay_within_days, held)

        summary = {
            "as_of": end,
            "invoices_reviewed": len(invoices),
            "on_hold": sorted(held),
            "payment_run": payment_run,
            "cash_applied": applied,
            "open_ar_total": aging["open_ar_total"],
            "aging_buckets": aging["buckets"],
            "open_ar": aging["rows"],
        }
        return AgentResult(
            agent=self.name,
            findings=[f for f in g.findings if f.agent == self.name],
            summary=summary,
            trace=self._trace,
        )

    # ---------------------------------------------------------------- rules
    def _emails(self, g: MemoryGraph, nid: str) -> list[str]:
        return [e.src for e in g.in_edges(nid, "MENTIONS") if g.nodes[e.src].type == "email"]

    def _duplicates(self, ctx: AgentContext, g: MemoryGraph, invoices: list[Node]) -> set[str]:
        held = set()
        for inv in invoices:
            recs = g.in_edges(inv.id, "RECORDS")
            postings = [e.src for e in recs if e.props.get("role") == "invoice_posting"]
            payments = [e.src for e in recs if e.props.get("role") == "payment"]
            if len(postings) < 2:
                continue
            p = inv.props
            bank = [e.src for e in g.in_edges(inv.id, "SETTLES")]
            paid_twice = len(payments) >= 2
            held.add(inv.id)
            self.finding(
                ctx,
                code="DUPLICATE_PAYMENT" if paid_twice else "DUPLICATE_INVOICE",
                key=p["number"],
                amount=p["total"],
                severity="high" if paid_twice else "medium",
                title=f"{p['number']} ({p['vendor_name']}) posted {len(postings)}x"
                + (f" and paid {len(payments)}x" if paid_twice else ""),
                detail=f"Same invoice arrived as {', '.join(p['variants'])} via "
                f"{', '.join(p['sources'])}; both copies were posted"
                + (
                    " and both paid. Request a refund or credit from the vendor "
                    "and reverse the second expense."
                    if paid_twice
                    else ". Void the second posting."
                ),
                entities=[inv.id, p["vendor_id"]],
                evidence=postings
                + payments
                + bank
                + self._emails(g, inv.id)
                + [e.src for e in g.in_edges(inv.id, "SCAN_OF")],
                proposed_je=dict(
                    memo=f"Reverse duplicate {p['number']}; due from {p['vendor_name']}",
                    lines=[("1300", p["total"], 0.0), ("5000", 0.0, p["total"])],
                )
                if paid_twice
                else dict(
                    memo=f"Void duplicate posting {p['number']}",
                    lines=[("2000", p["total"], 0.0), ("5000", 0.0, p["total"])],
                ),
            )
        return held

    def _amount_mismatches(
        self, ctx: AgentContext, g: MemoryGraph, invoices: list[Node]
    ) -> set[str]:
        held = set()
        for inv in invoices:
            p = inv.props
            for e in g.in_edges(inv.id, "RECORDS"):
                diff = e.props.get("amount_diff")
                if e.props.get("role") != "invoice_posting" or not diff:
                    continue
                # Corroborate the feed total with an independent source before acting.
                scans = [x.src for x in g.in_edges(inv.id, "SCAN_OF")]
                scan_ok = (
                    p.get("scan_total") is not None and abs(p["scan_total"] - p["total"]) < 0.005
                )
                emails = self._emails(g, inv.id)
                email_ok = any(p["total"] in g.nodes[m].props.get("amounts", []) for m in emails)
                sources = [s for s, ok in (("scan", scan_ok), ("email", email_ok)) if ok]
                held.add(inv.id)
                acct = next(
                    (
                        ln["account"]
                        for ln in g.nodes[e.src].props["lines"]
                        if ln["account"] != "2000"
                    ),
                    "6300",
                )
                self.finding(
                    ctx,
                    code="AMOUNT_MISMATCH",
                    key=p["number"],
                    amount=abs(diff),
                    severity="high" if sources else "medium",
                    title=f"{p['number']} booked {e.props['amount']:,.2f} vs invoice "
                    f"{p['total']:,.2f} ({diff:+,.2f})",
                    detail=(
                        f"Invoice total confirmed by {' and '.join(sources)}. "
                        if sources
                        else "No independent confirmation of the invoice total. "
                    )
                    + (
                        "Digit transposition in the posting; "
                        if sorted(f"{p['total']:.2f}") == sorted(f"{e.props['amount']:.2f}")
                        else ""
                    )
                    + f"AP is {'over' if diff > 0 else 'under'}stated by {abs(diff):,.2f}.",
                    entities=[inv.id, p["vendor_id"]],
                    evidence=[e.src] + scans + emails,
                    proposed_je=dict(
                        memo=f"Correct {p['number']} to invoice total",
                        lines=[
                            ("2000", max(diff, 0), max(-diff, 0)),
                            (acct, max(-diff, 0), max(diff, 0)),
                        ],
                    ),
                )
        return held

    def _unrecorded_liabilities(
        self, ctx, g: MemoryGraph, invoices: list[Node], end: str
    ) -> set[str]:
        held = set()
        for inv in invoices:
            p = inv.props
            if p.get("posted_count", 0) or p.get("gl_only"):
                continue
            if not p.get("invoice_date") or p["invoice_date"] > end:
                continue
            vendor_mails = [
                x.src
                for x in g.in_edges(p["vendor_id"], "MENTIONS")
                if g.nodes[x.src].type == "email"
            ]
            scans = [x.src for x in g.in_edges(inv.id, "SCAN_OF")]
            precedent = [
                n
                for n in (g.nodes[e.src] for e in g.in_edges(p["vendor_id"], "ISSUED_BY"))
                if n.id != inv.id and n.props.get("total") == p["total"]
            ]
            held.add(inv.id)
            self.finding(
                ctx,
                code="UNRECORDED_LIABILITY",
                key=p["number"],
                amount=p["total"],
                severity="high",
                title=f"{p['number']} ({p['vendor_name']}, dated {p['invoice_date']}) "
                "not in the GL",
                detail=f"Received {p['received_at'][-1] if p.get('received_at') else 'n/a'}, "
                f"{'scanned, ' if scans else ''}no posting by {end}. Accrue in the period the "
                f"service was delivered."
                + (
                    f" Precedent: {', '.join(n.props['number'] for n in precedent)} "
                    "at the same amount."
                    if precedent
                    else ""
                ),
                entities=[inv.id, p["vendor_id"]],
                evidence=scans + self._emails(g, inv.id) + vendor_mails + [n.id for n in precedent],
                proposed_je=dict(
                    memo=f"Accrue {p['vendor_name']} {p['number']}",
                    lines=[("6300", p["total"], 0.0), ("2100", 0.0, p["total"])],
                ),
            )
        return held

    def _remit_changes(self, ctx: AgentContext, g: MemoryGraph) -> set[str]:
        held = set()
        for v in [n for n in g.nodes.values() if n.type == "vendor"]:
            accts = g.out_edges(v.id, "USES_ACCOUNT")
            usual = v.props.get("usual_remit_account")
            for e in accts:
                if len(accts) < 2 or e.dst == usual:
                    continue
                invs = [g.resolve(i) for i in e.props["invoices"]]
                emails = [
                    x.src for x in g.in_edges(e.dst, "MENTIONS") if g.nodes[x.src].type == "email"
                ]
                lookalike = [
                    m
                    for m in emails
                    if (lk := g.edge(m, "MENTIONS", v.id)) and lk.props.get("lookalike_domain")
                ]
                paid = [x.src for i in invs for x in g.in_edges(i, "SETTLES")]
                scans = [x.src for i in invs for x in g.in_edges(i, "SCAN_OF")]
                amount = round(sum(g.nodes[i].props.get("total") or 0 for i in invs), 2)
                held.update(invs)
                self.finding(
                    ctx,
                    code="VENDOR_BANK_CHANGE",
                    key=", ".join(e.props["invoices"]),
                    amount=amount,
                    severity="critical" if (lookalike and paid) else "high",
                    title=f"{v.props['name']} remit-to changed from {usual} to {e.dst}"
                    + (" after an email from a look-alike domain" if lookalike else ""),
                    detail=f"Account first seen {e.props['first_seen']} on "
                    f"{', '.join(e.props['invoices'])}; "
                    f"previous invoices used {usual}."
                    + (
                        f" Change requested from {g.nodes[lookalike[0]].props['from_domain']}, "
                        f"not the vendor's domain."
                        if lookalike
                        else ""
                    )
                    + (
                        f" Payment already sent ({', '.join(paid)}): contact the vendor on a known "
                        "number and attempt a wire recall."
                        if paid
                        else " Hold payment until the vendor confirms on a known number."
                    ),
                    entities=[v.id, e.dst] + invs,
                    evidence=emails + paid + scans,
                )
        return held

    def _short_pays(self, ctx: AgentContext, g: MemoryGraph, receivables: list[Node]) -> set[str]:
        disputed = set()
        for ar in receivables:
            p = ar.props
            for e in g.in_edges(ar.id, "SETTLES"):
                diff = e.props.get("amount_diff")
                if diff is None or diff >= 0:
                    continue
                emails = self._emails(g, ar.id)
                reason = g.nodes[emails[0]].props.get("subject") if emails else None
                if emails:
                    disputed.add(ar.id)
                self.finding(
                    ctx,
                    code="SHORT_PAY_DISPUTE" if emails else "SHORT_PAY",
                    key=p["number"],
                    amount=abs(diff),
                    severity="medium",
                    title=f"{p['number']} short-paid by {abs(diff):,.2f}"
                    + (f": {reason}" if reason else ""),
                    detail=(
                        "Customer explained the deduction in writing; treat the open balance as a "
                        "dispute, not a late payment, and issue a credit memo or replacement."
                        if emails
                        else "No explanation on file; chase the balance."
                    ),
                    entities=[ar.id, p["customer_id"]],
                    evidence=[e.src] + emails,
                    proposed_je=dict(
                        memo=f"Credit memo {p['number']} (damaged goods)",
                        lines=[("4000", abs(diff), 0.0), ("1200", 0.0, abs(diff))],
                    )
                    if emails
                    else None,
                )
        return disputed

    def _promises(
        self, ctx: AgentContext, g: MemoryGraph, receivables: list[Node]
    ) -> dict[str, str]:
        promised: dict[str, str] = {}
        for m in [
            n for n in g.nodes.values() if n.type == "email" and n.props.get("promised_date")
        ]:
            for e in g.out_edges(m.id, "MENTIONS"):
                c = g.nodes[e.dst]
                if c.type != "customer":
                    continue
                open_ars = [
                    a
                    for a in receivables
                    if a.props.get("customer_id") == c.id and a.props.get("open_amount", 0) > 0
                ]
                for a in open_ars:
                    promised[a.id] = m.props["promised_date"]
                self.finding(
                    ctx,
                    code="PROMISE_TO_PAY",
                    key=c.id,
                    amount=c.props.get("open_ar"),
                    severity="info",
                    title=f"{c.props['name']} promised full payment by {m.props['promised_date']}",
                    detail=f"{len(open_ars)} open invoices; nothing received this quarter. "
                    "Forecast the "
                    f"collection on {m.props['promised_date']} rather than by due date.",
                    entities=[c.id] + [a.id for a in open_ars],
                    evidence=[m.id],
                    data={
                        "promised_date": m.props["promised_date"],
                        "invoices": [a.props["number"] for a in open_ars],
                    },
                )
        return promised

    def _cash_application(self, g: MemoryGraph, receivables: list[Node]) -> list[dict]:
        applied = []
        for ar in receivables:
            for e in g.in_edges(ar.id, "SETTLES"):
                applied.append(
                    {
                        "invoice": ar.props["number"],
                        "bank": e.src,
                        "amount": e.props.get("amount"),
                        "via": e.props.get("via"),
                    }
                )
        return applied

    def _aging(self, ctx, g, receivables, as_of: date, disputed: set[str], promised: dict) -> dict:
        rows, buckets = [], {name: 0.0 for _, name in AGING_BUCKETS}
        for ar in sorted(receivables, key=lambda n: n.props["number"]):
            p = ar.props
            if p.get("open_amount", 0) <= 0.005:
                continue
            due = _d(p.get("due_date"))
            dpd = max((as_of - due).days, 0) if due else 0
            b = _bucket(dpd)
            buckets[b] = round(buckets[b] + p["open_amount"], 2)
            rows.append(
                {
                    "invoice": p["number"],
                    "customer_id": p["customer_id"],
                    "due": p.get("due_date"),
                    "open": p["open_amount"],
                    "days_past_due": dpd,
                    "bucket": b,
                    "status": "disputed"
                    if ar.id in disputed
                    else "promised"
                    if ar.id in promised
                    else "overdue"
                    if dpd
                    else "current",
                    "promised_date": promised.get(ar.id),
                }
            )
        total = round(sum(r["open"] for r in rows), 2)
        overdue = [r for r in rows if r["days_past_due"] > 0 and r["status"] == "overdue"]
        self.finding(
            ctx,
            code="AR_AGING",
            key=as_of.isoformat(),
            amount=total,
            severity="info",
            title=f"Open AR {total:,.2f} across {len(rows)} invoices at {as_of}; "
            f"{len(overdue)} overdue, {sum(r['status'] == 'disputed' for r in rows)} disputed, "
            f"{sum(r['status'] == 'promised' for r in rows)} promised",
            detail="; ".join(
                f"{r['invoice']} {r['open']:,.2f} {r['days_past_due']}d {r['status']}"
                for r in rows
                if r["status"] != "current"
            ),
            entities=[g.resolve(r["invoice"]) for r in rows],
            data={"rows": rows, "buckets": buckets, "open_ar_total": total},
        )
        return {"rows": rows, "buckets": buckets, "open_ar_total": total}

    def _payment_run(
        self, ctx, g, invoices, as_of: date, within: int, held: set[str]
    ) -> list[dict]:
        run = []
        for inv in sorted(invoices, key=lambda n: str(n.props.get("due_date"))):
            p = inv.props
            if p.get("status") != "open" or inv.id in held:
                continue
            due = _d(p.get("due_date"))
            if due and (due - as_of).days > within:
                continue
            run.append(
                {
                    "invoice": p["number"],
                    "vendor": p["vendor_name"],
                    "due": p.get("due_date"),
                    "amount": p["total"],
                    "currency": p.get("currency", "USD"),
                    "remit_account": p.get("remit_account"),
                }
            )
        total = round(sum(r["amount"] for r in run), 2)
        self.finding(
            ctx,
            code="PAYMENT_RUN",
            key=as_of.isoformat(),
            amount=total,
            severity="info",
            title=f"Payment run at {as_of}: {len(run)} invoices, {total:,.2f}; {len(held)} on hold",
            detail="; ".join(
                f"{r['invoice']} {r['vendor']} {r['amount']:,.2f} due {r['due']}" for r in run
            ),
            entities=[g.resolve(r["invoice"]) for r in run],
            data={"run": run, "on_hold": sorted(held)},
        )
        return run
