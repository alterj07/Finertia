"""Matching rules for the Cash & Reconciliation agent.

Ported 1:1 from the lab's CashReconAgent.reconcile passes:
  1. ReferenceMatch   — invoice/check reference + exact amount, closest date
  2. AmountDateMatch  — exact amount, closest date within a window
  3. ManyToOneMatch   — one bank line = several book lines (subset-sum remittance)
  4. ToleranceMatch   — near-amount -> FX / fee differences
"""

import itertools
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.agents.feedback import Adjustment
from app.agents.recon.models import Match, RuleParams
from app.data.models import BankTxn, GLLine

if TYPE_CHECKING:
    from app.agents.base import AgentContext


@dataclass
class MatchState:
    bank: list[BankTxn]
    book: list[GLLine]
    ctx: "AgentContext"
    params: RuleParams
    matches: list[Match] = field(default_factory=list)
    matched_bank: set[str] = field(default_factory=set)
    matched_book: set[str] = field(default_factory=set)
    blocked: set[tuple[str, str]] = field(default_factory=set)  # (txn_id, je_id)
    pending_findings: list[dict[str, Any]] = field(default_factory=list)

    def bank_free(self, b: BankTxn) -> bool:
        return b.txn_id not in self.matched_bank

    def book_free(self, g: GLLine) -> bool:
        return g.je_id not in self.matched_book

    def allowed(self, b: BankTxn, g: GLLine) -> bool:
        return (b.txn_id, g.je_id) not in self.blocked

    def link(self, bs: list[BankTxn], gs: list[GLLine], method: str, note: str = "") -> None:
        for b in bs:
            self.matched_bank.add(b.txn_id)
        for g in gs:
            self.matched_book.add(g.je_id)
        self.matches.append(
            Match(
                method=method,
                bank=[b.txn_id for b in bs],
                book=[g.je_id for g in gs],
                note=note,
            )
        )

    def emit(self, **finding_kw: Any) -> None:
        self.pending_findings.append(finding_kw)


def _day_diff(a, b) -> int:
    return abs((a - b).days)


class MatchRule(ABC):
    name: str = "rule"

    @abstractmethod
    def apply(self, state: MatchState) -> None: ...


class ReferenceMatch(MatchRule):
    """Pass 1: reference (invoice number or check number) + exact amount."""

    name = "reference"

    def apply(self, state: MatchState) -> None:
        for b in state.bank:
            if not state.bank_free(b):
                continue
            cands = [
                g
                for g in state.book
                if state.book_free(g)
                and state.allowed(b, g)
                and abs(g.amount - b.amount) < 0.005
                and (
                    (g.doc_ref_norm and g.doc_ref_norm in (b.refs_norm or []))
                    or (g.check_number and g.check_number == str(b.check_number))
                )
            ]
            if cands:
                g = min(cands, key=lambda g: _day_diff(g.posting_date, b.posted_date))
                state.link([b], [g], self.name)


class AmountDateMatch(MatchRule):
    """Pass 2: exact amount, closest date within the window."""

    name = "amount+date"

    def apply(self, state: MatchState) -> None:
        for b in (b for b in state.bank if state.bank_free(b)):
            cands = [
                g
                for g in state.book
                if state.book_free(g)
                and state.allowed(b, g)
                and abs(g.amount - b.amount) < 0.005
                and _day_diff(g.posting_date, b.posted_date) <= state.params.date_window_days
            ]
            if cands:
                g = min(cands, key=lambda g: _day_diff(g.posting_date, b.posted_date))
                state.link([b], [g], self.name)


class ManyToOneMatch(MatchRule):
    """Pass 3: one bank line = several book lines (lump-sum remittance),
    confirmed by email."""

    name = "many-to-one"

    def apply(self, state: MatchState) -> None:
        p = state.params
        for b in (b for b in state.bank if state.bank_free(b)):
            cands = [
                g
                for g in state.book
                if state.book_free(g)
                and state.allowed(b, g)
                and (g.amount > 0) == (b.amount > 0)
                and _day_diff(g.posting_date, b.posted_date) <= p.lump_sum_window_days
            ][: p.lump_sum_max_candidates]
            for k in range(2, p.lump_sum_max_k + 1):
                combo = next(
                    (
                        c
                        for c in itertools.combinations(cands, k)
                        if abs(sum(g.amount for g in c) - b.amount) < 0.005
                    ),
                    None,
                )
                if combo:
                    mails = state.ctx.lake.emails_with_amount(abs(b.amount))
                    m = re.search(r"REMIT (\d+)", b.description) or re.search(
                        r"(\w+)$", b.description
                    )
                    ref = m.group(1)
                    state.link(
                        [b],
                        list(combo),
                        self.name,
                        f"remittance {mails[0].file if mails else 'not found'}",
                    )
                    state.emit(
                        code="LUMP_SUM_MATCH",
                        key=ref,
                        amount=b.amount,
                        severity="info",
                        title=f"Bank {b.txn_id} ${b.amount:,.2f} = {k} GL receipts "
                        f"({', '.join(g.doc_ref for g in combo)})",
                        detail="Matched by subset-sum within "
                        f"+/-{p.lump_sum_window_days} days; "
                        + (
                            f"confirmed by {mails[0].file}."
                            if mails
                            else "no remittance found."
                        ),
                        entities=[g.doc_ref for g in combo] + [b.txn_id],
                        evidence=[m.file for m in mails],
                    )
                    break


class ToleranceMatch(MatchRule):
    """Pass 4: near-amount (within tolerance_pct) -> FX / fee differences."""

    name = "tolerance"

    def apply(self, state: MatchState) -> None:
        p = state.params
        for b in (b for b in state.bank if state.bank_free(b)):
            cands = [
                g
                for g in state.book
                if state.book_free(g)
                and state.allowed(b, g)
                and (g.amount > 0) == (b.amount > 0)
                and abs(g.amount - b.amount) <= p.tolerance_pct * abs(b.amount)
                and _day_diff(g.posting_date, b.posted_date) <= p.tolerance_window_days
            ]
            if not cands:
                continue
            g = min(cands, key=lambda g: abs(g.amount - b.amount))
            diff = round(b.amount - g.amount, 2)
            inv = state.ctx.lake.invoice_by_ref(g.doc_ref_norm)
            ccy = inv.currency if inv else "USD"
            state.link([b], [g], self.name, f"diff {diff}")
            code = "FX_DIFFERENCE" if ccy != "USD" else "AMOUNT_VARIANCE"
            state.emit(
                code=code,
                key=g.doc_ref,
                amount=abs(diff),
                severity="medium",
                title=f"{g.doc_ref} ({ccy}) wire settled at ${-b.amount:,.2f} "
                f"vs booked ${-g.amount:,.2f}",
                detail=f"Unrecorded {'FX loss' if diff < 0 else 'FX gain'} "
                f"of ${abs(diff):,.2f}.",
                entities=[g.vendor_id, g.doc_ref],
                evidence=[b.txn_id, g.je_id],
                proposed_je=dict(
                    memo=f"FX {'loss' if diff < 0 else 'gain'} on {g.doc_ref}",
                    lines=[
                        ("6800", max(-diff, 0), max(diff, 0)),
                        ("1000", max(diff, 0), max(-diff, 0)),
                    ],
                ),
            )


def default_rules(params: RuleParams) -> list[MatchRule]:
    return [ReferenceMatch(), AmountDateMatch(), ManyToOneMatch(), ToleranceMatch()]


class RuleBook:
    """Ordered list of match rules plus the feedback-driven adjustments."""

    def __init__(self, rules: list[MatchRule], params: RuleParams) -> None:
        self.rules = rules
        self.params = params
        self.pins: list[tuple[list[str], list[str]]] = []  # (bank_ids, book_ids)
        self.blocks: set[tuple[str, str]] = set()

    @classmethod
    def build(cls, adjustments: list[Adjustment]) -> "RuleBook":
        params = RuleParams()
        book = cls(default_rules(params), params)
        book.apply_adjustments(adjustments)
        return book

    def apply_adjustments(self, adjustments: list[Adjustment]) -> None:
        for adj in adjustments:
            if adj.kind == "rule_param":
                for k, v in adj.payload.items():
                    if hasattr(self.params, k):
                        setattr(self.params, k, v)
            elif adj.kind == "pin_match":
                self.pins.append(
                    (list(adj.payload.get("bank_ids", [])), list(adj.payload.get("book_ids", [])))
                )
            elif adj.kind == "block_match":
                pairs = adj.payload.get("pairs", [])
                if pairs:
                    for pair in pairs:
                        self.blocks.add((pair[0], pair[1]))
                else:
                    self.blocks.add((adj.payload["bank_id"], adj.payload["book_id"]))
            elif adj.kind in ("reclassify", "note"):
                # Stored and queryable, but no rule behaviour yet — hook for a
                # future implementation (e.g. re-tagging match methods).
                continue

    def apply_pins(self, state: MatchState) -> None:
        by_txn = {b.txn_id: b for b in state.bank}
        by_je = {g.je_id: g for g in state.book}
        for bank_ids, book_ids in self.pins:
            bs = [by_txn[i] for i in bank_ids if i in by_txn and state.bank_free(by_txn[i])]
            gs = [by_je[i] for i in book_ids if i in by_je and state.book_free(by_je[i])]
            if bs and gs:
                state.link(bs, gs, "pinned", "pinned by feedback adjustment")

    def run(self, state: MatchState) -> None:
        state.blocked |= self.blocks
        self.apply_pins(state)
        for rule in self.rules:
            rule.apply(state)
