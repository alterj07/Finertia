"""Structural anomalies the seeded graph can surface on its own.

Each function is a graph query, not a judgment: it hands an agent a lead with
the entities and evidence attached. The Cash & Reconciliation agent already
computes its own matches, so the cash-side signals here are a cross-check.
"""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from app.memory.models import Signal

if TYPE_CHECKING:
    from app.memory.graph import MemoryGraph

AP_AR = "AP/AR"
CASH = "Cash & Reconciliation"
CLOSE = "Close"
AUDIT = "Audit & Controls"
FORECAST = "Forecasting"


def all_signals(
    g: MemoryGraph, period: str | None = None, agent: str | None = None
) -> list[Signal]:
    out: list[Signal] = []
    for fn in (
        duplicate_invoices,
        amount_mismatches,
        vendor_bank_changes,
        lump_sum_receipts,
        unrecorded_bank_items,
        short_pays,
        unrecorded_liabilities,
        sod_violations,
        timing_items,
        fx_differences,
        promises_to_pay,
    ):
        out.extend(fn(g))
    if period:
        out = [s for s in out if s.period in (None, period)]
    if agent:
        out = [s for s in out if s.suggested_agent == agent]
    return out


def _emails_mentioning(g: MemoryGraph, nid: str) -> list[str]:
    return [e.src for e in g.in_edges(nid, "MENTIONS") if g.nodes[e.src].type == "email"]


def _invoices(g: MemoryGraph):
    return [n for n in g.nodes.values() if n.type == "invoice"]


def duplicate_invoices(g: MemoryGraph) -> list[Signal]:
    out = []
    for inv in _invoices(g):
        recs = g.in_edges(inv.id, "RECORDS")
        postings = [e.src for e in recs if e.props.get("role") == "invoice_posting"]
        payments = [e.src for e in recs if e.props.get("role") == "payment"]
        if len(postings) < 2:
            continue
        paid_twice = len(payments) >= 2
        bank = [e.src for e in g.in_edges(inv.id, "SETTLES")]
        out.append(
            Signal(
                code="DUPLICATE_PAYMENT" if paid_twice else "DUPLICATE_INVOICE",
                key=inv.props["number"],
                suggested_agent=AP_AR,
                amount=inv.props.get("total"),
                period=inv.props.get("period"),
                title=f"{inv.props['number']} ({inv.props['vendor_name']}) posted {len(postings)}x"
                + (f", paid {len(payments)}x" if paid_twice else ""),
                detail=f"Variants {inv.props['variants']} arrived via {inv.props['sources']}.",
                entities=[inv.id, inv.props["vendor_id"]],
                evidence=postings + payments + bank + _emails_mentioning(g, inv.id),
            )
        )
    return out


def amount_mismatches(g: MemoryGraph) -> list[Signal]:
    out = []
    for inv in _invoices(g):
        for e in g.in_edges(inv.id, "RECORDS"):
            diff = e.props.get("amount_diff")
            if e.props.get("role") == "invoice_posting" and diff:
                out.append(
                    Signal(
                        code="AMOUNT_MISMATCH",
                        key=inv.props["number"],
                        suggested_agent=AP_AR,
                        amount=abs(diff),
                        period=inv.props.get("period"),
                        title=f"{inv.props['number']} booked {e.props['amount']:,.2f} vs invoice "
                        f"{inv.props['total']:,.2f} (diff {diff:+,.2f})",
                        entities=[inv.id, inv.props["vendor_id"]],
                        evidence=[e.src]
                        + _emails_mentioning(g, inv.id)
                        + [x.src for x in g.in_edges(inv.id, "SCAN_OF")],
                    )
                )
    return out


def vendor_bank_changes(g: MemoryGraph) -> list[Signal]:
    out = []
    for v in [n for n in g.nodes.values() if n.type == "vendor"]:
        accts = g.out_edges(v.id, "USES_ACCOUNT")
        if len(accts) < 2:
            continue
        usual = v.props.get("usual_remit_account")
        for e in accts:
            if e.dst == usual:
                continue
            invs = [g.resolve(i) for i in e.props["invoices"]]
            emails = [
                x.src for x in g.in_edges(e.dst, "MENTIONS") if g.nodes[x.src].type == "email"
            ]
            lookalike = []
            for m in emails:
                link = g.edge(m, "MENTIONS", v.id)
                if link and link.props.get("lookalike_domain"):
                    lookalike.append(m)
            paid = [x.src for i in invs for x in g.in_edges(i, "SETTLES")]
            amount = sum(g.nodes[i].props.get("total") or 0 for i in invs)
            out.append(
                Signal(
                    code="VENDOR_BANK_CHANGE",
                    key=", ".join(e.props["invoices"]),
                    suggested_agent=AUDIT,
                    amount=amount,
                    period=e.props["first_seen"][:7],
                    title=f"{v.props['name']} remit-to moved from {usual} to {e.dst} "
                    f"on {e.props['first_seen']}"
                    + (" after an email from a look-alike domain" if lookalike else "")
                    + ("; payment already sent" if paid else ""),
                    entities=[v.id, e.dst] + invs,
                    evidence=emails + paid,
                )
            )
    return out


def lump_sum_receipts(g: MemoryGraph) -> list[Signal]:
    out = []
    for b in [n for n in g.nodes.values() if n.type == "bank_txn"]:
        settles = [e for e in g.out_edges(b.id, "SETTLES") if g.nodes[e.dst].type == "ar_invoice"]
        if len(settles) < 2:
            continue
        out.append(
            Signal(
                code="LUMP_SUM_MATCH",
                key=b.props.get("remit_ref") or b.id,
                suggested_agent=CASH,
                amount=b.props["amount"],
                period=b.props["period"],
                title=f"{b.id} {b.props['amount']:,.2f} covers {len(settles)} AR invoices",
                entities=[b.id] + [e.dst for e in settles],
                evidence=[e.src for e in g.in_edges(b.id, "EXPLAINS")],
            )
        )
    return out


def unrecorded_bank_items(g: MemoryGraph) -> list[Signal]:
    by_period: dict[str, list] = defaultdict(list)
    for b in [n for n in g.nodes.values() if n.type == "bank_txn"]:
        if b.props["txn_type"] in ("FEE", "INTEREST") and not g.out_edges(b.id, "CLEARS"):
            by_period[b.props["period"]].append(b)
    return [
        Signal(
            code="UNRECORDED_BANK_ITEMS",
            key=p,
            suggested_agent=CASH,
            period=p,
            amount=round(sum(b.props["amount"] for b in items), 2),
            title=f"{len(items)} bank fee/interest lines in {p} with no journal entry",
            entities=[b.id for b in items],
        )
        for p, items in by_period.items()
    ]


def short_pays(g: MemoryGraph) -> list[Signal]:
    out = []
    for ar in [n for n in g.nodes.values() if n.type == "ar_invoice"]:
        for e in g.in_edges(ar.id, "SETTLES"):
            diff = e.props.get("amount_diff")
            if diff is not None and diff < 0:
                emails = _emails_mentioning(g, ar.id)
                out.append(
                    Signal(
                        code="SHORT_PAY_DISPUTE" if emails else "SHORT_PAY",
                        key=ar.props["number"],
                        suggested_agent=AP_AR,
                        amount=abs(diff),
                        period=ar.props.get("period"),
                        title=f"{ar.props['number']} paid {e.props['amount']:,.2f} "
                        f"of {ar.props['amount']:,.2f}",
                        entities=[ar.id, ar.props["customer_id"]],
                        evidence=[e.src] + emails,
                    )
                )
    return out


def unrecorded_liabilities(g: MemoryGraph) -> list[Signal]:
    out = []
    for inv in _invoices(g):
        if inv.props.get("posted_count", 0) == 0 and not inv.props.get("gl_only"):
            out.append(
                Signal(
                    code="UNRECORDED_LIABILITY",
                    key=inv.props["number"],
                    suggested_agent=CLOSE,
                    amount=inv.props.get("total"),
                    period=inv.props.get("period"),
                    title=f"{inv.props['number']} ({inv.props['vendor_name']}, "
                    f"{inv.props.get('invoice_date')}) "
                    f"received but not in the GL; needs accrual",
                    entities=[inv.id, inv.props["vendor_id"]],
                    evidence=_emails_mentioning(g, inv.id)
                    + [x.src for x in g.in_edges(inv.id, "SCAN_OF")]
                    + [
                        x.src
                        for x in g.in_edges(inv.props["vendor_id"], "MENTIONS")
                        if g.nodes[x.src].type == "email"
                    ],
                )
            )
    return out


def sod_violations(g: MemoryGraph) -> list[Signal]:
    out = []
    for je in [n for n in g.nodes.values() if n.type == "journal"]:
        p = je.props
        flags = [
            f for f in ("self_approved", "off_hours", "round_amount", "no_doc_ref") if p.get(f)
        ]
        if p.get("self_approved") or (p["source"] == "MANUAL" and len(flags) >= 3):
            out.append(
                Signal(
                    code="SOD_VIOLATION",
                    key=je.id,
                    suggested_agent=AUDIT,
                    amount=p["amount"],
                    period=p["period"],
                    title=f"{je.id} {p['amount']:,.2f} posted {p['entered_at']} "
                    f"by {p['posted_by']}, "
                    f"approved by {p['approved_by']}: {', '.join(flags)}",
                    entities=[je.id, f"user:{p['posted_by']}"],
                )
            )
    return out


def timing_items(g: MemoryGraph) -> list[Signal]:
    out = []
    for je in [n for n in g.nodes.values() if n.type == "journal"]:
        p = je.props
        if p["kind"] not in ("payment", "receipt") or g.in_edges(je.id, "CLEARS"):
            continue
        kind = "outstanding check" if p["cash_delta"] < 0 else "deposit in transit"
        key = f"CHECK {p['check_number']}" if p.get("check_number") else (p.get("doc_ref") or je.id)
        out.append(
            Signal(
                code="TIMING_ITEMS",
                key=key,
                suggested_agent=CASH,
                amount=abs(p["cash_delta"]),
                period=p["period"],
                title=f"{je.id} {p['memo']}: {kind}, not yet at the bank",
                entities=[je.id],
                evidence=_emails_mentioning(g, g.resolve(p["doc_ref"])) if p.get("doc_ref") else [],
            )
        )
    return out


def fx_differences(g: MemoryGraph) -> list[Signal]:
    out = []
    for inv in _invoices(g):
        if inv.props.get("currency", "USD") == "USD":
            continue
        for e in g.in_edges(inv.id, "SETTLES"):
            for c in g.out_edges(e.src, "CLEARS"):
                if c.props.get("amount_diff"):
                    out.append(
                        Signal(
                            code="FX_DIFFERENCE",
                            key=inv.props["number"],
                            suggested_agent=CASH,
                            amount=abs(c.props["amount_diff"]),
                            period=g.nodes[e.src].props["period"],
                            title=f"{inv.props['number']} ({inv.props['currency']}) settled "
                            f"{c.props['amount']:,.2f} vs booked "
                            f"{c.props['amount'] - c.props['amount_diff']:,.2f}",
                            entities=[inv.id, inv.props["vendor_id"]],
                            evidence=[e.src, c.dst],
                        )
                    )
    return out


def promises_to_pay(g: MemoryGraph) -> list[Signal]:
    out = []
    for m in [n for n in g.nodes.values() if n.type == "email"]:
        if not m.props.get("promised_date"):
            continue
        custs = [e.dst for e in g.out_edges(m.id, "MENTIONS") if g.nodes[e.dst].type == "customer"]
        for c in custs:
            open_ars = [
                e.src
                for e in g.in_edges(c, "BILLED_TO")
                if g.nodes[e.src].props.get("open_amount", 0) > 0
            ]
            out.append(
                Signal(
                    code="PROMISE_TO_PAY",
                    key=c,
                    suggested_agent=FORECAST,
                    amount=g.nodes[c].props.get("open_ar"),
                    period=m.props["period"],
                    title=f"{g.nodes[c].props['name']} promised full payment "
                    f"by {m.props['promised_date']}",
                    entities=[c] + open_ars,
                    evidence=[m.id],
                )
            )
    return out
