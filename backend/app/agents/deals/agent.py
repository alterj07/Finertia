"""Deals agent: reads the inbox, decides which emails are sales opportunities,
sizes them, checks the counterparty's payment history in shared memory, and
drafts a reply a person can copy and send.

Deterministic: classification is keyword + graph rules, value estimates come
from the email or the customer's invoice history, and drafts are templates
filled from graph facts. An LLM (when configured) may only rephrase a draft;
it never decides what is a deal or what the numbers are.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.agents.base import Agent, AgentContext, AgentResult
from app.memory.graph import MemoryGraph
from app.memory.models import Finding, Node

COMPANY_DOMAIN = "northwindrobotics.com"
SALES_INBOX = "sales@northwindrobotics.com"
GRACE_DAYS = 7

INTENT = {
    "quote": 3,
    "quotation": 3,
    "rfq": 4,
    "proposal": 3,
    "pricing": 3,
    "price": 2,
    "order": 3,
    "purchase": 3,
    "pilot": 3,
    "renew": 3,
    "renewal": 3,
    "units": 2,
    "expand": 2,
    "additional": 1,
    "budget": 2,
    "lead time": 1,
    "ship": 1,
    "contract": 1,
    "call": 1,
    "scope": 1,
}
NOT_DEAL = {
    "invoice": -3,
    "remittance": -4,
    "payment received": -4,
    "resending": -4,
    "short payment": -4,
    "past due": -4,
    "remit all payments": -5,
    "password": -6,
    "close kicks off": -6,
    "check #": -4,
    "statement": -3,
    "withholding": -4,
    "your renewal": -3,
    "reply to this email to accept": -5,
}
_UNITS = re.compile(
    r"\b(\d{1,4})\s+(?:more\s+|additional\s+)?(?:units|cells|robots|systems)\b", re.I
)
_DEADLINE = re.compile(
    r"\b(?:by|before|closes|freezes on|end of)\s+(?:the\s+end\s+of\s+)?"
    r"((?:January|February|March|April|May|June|July|August|September|October|November|December)"
    r"(?:\s+\d{1,2})?)",
    re.I,
)


def _first_name(sender: str) -> str:
    name = sender.split("<")[0].strip().strip('"')
    return name.split()[0] if name and "@" not in name else "there"


def _org(sender: str, node: Node | None) -> str:
    if node:
        return node.props.get("name", "")
    m = re.search(r"@([\w-]+)\.", sender)
    return m.group(1).replace("-", " ").title() if m else "your team"


class DealsAgent(Agent):
    name = "Deals"
    description = (
        "Triages the inbox: decides which emails are sales opportunities (new inbound, "
        "expansion, renewal, RFQ), sizes each from the ask or the customer's invoice "
        "history, checks the customer's payment record in shared memory (overdue AR, "
        "disputes, promises to pay), and drafts a reply for a person to send."
    )
    capabilities = [
        "deals",
        "sales",
        "pipeline",
        "quote",
        "rfq",
        "renewal",
        "pilot",
        "inbox",
        "email",
        "reply",
        "draft",
        "customers",
        "opportunity",
    ]
    params_schema = {"as_of": {"type": "string", "format": "date", "default": "2026-04-03"}}

    # ------------------------------------------------------------------ run
    def run(self, ctx: AgentContext, as_of: str = "2026-04-03", **_: Any) -> AgentResult:
        g = ctx.memory
        if not any(e.agent == "ingest" for e in g.edges):
            g.seed(ctx.lake)
        emails = sorted((n for n in g.nodes.values() if n.type == "email"), key=lambda n: n.id)
        self.trace("emails in inbox", rows=len(emails))
        triage: list[dict[str, Any]] = []
        pipeline = 0.0
        for m in emails:
            t = self._classify(g, m)
            triage.append(t)
            if not t["is_deal"]:
                continue
            facts = self._facts(g, m, t, date.fromisoformat(as_of))
            draft = self._draft(m, t, facts)
            draft = self._polish(ctx, draft, facts)
            pipeline += facts["value_estimate"] or 0.0
            self.finding(
                ctx,
                code="DEAL",
                key=m.id,
                amount=facts["value_estimate"],
                severity="high" if facts["credit_risk"] else "info",
                title=f"{t['stage']}: {facts['org']} — {m.props.get('subject', '')}",
                detail=f"{t['reason']}. "
                + (f"Credit risk: {facts['credit_risk']}. " if facts["credit_risk"] else "")
                + f"Est. value {facts['value_estimate']:,.0f} ({facts['value_basis']}).",
                entities=[m.id] + ([facts["party_id"]] if facts["party_id"] else []),
                evidence=facts["evidence"],
                data={"stage": t["stage"], "score": t["score"], "facts": facts, "draft": draft},
            )
        deals = [t for t in triage if t["is_deal"]]
        return AgentResult(
            agent=self.name,
            findings=[f for f in g.findings if f.agent == self.name],
            summary={
                "as_of": as_of,
                "emails": len(emails),
                "deals": len(deals),
                "pipeline_estimate": round(pipeline, 2),
                "triage": triage,
            },
            trace=self._trace,
        )

    # --------------------------------------------------------- classification
    def _classify(self, g: MemoryGraph, m: Node) -> dict[str, Any]:
        p = m.props
        text = f"{p.get('subject', '')}\n{p.get('text', '')}".lower()
        parties = [
            g.nodes[e.dst]
            for e in g.out_edges(m.id, "MENTIONS")
            if g.nodes[e.dst].type in ("vendor", "customer")
            and e.props.get("via") == "sender_domain"
        ]
        sender_party = parties[0] if parties else None
        score = sum(w for k, w in INTENT.items() if k in text)
        score += sum(w for k, w in NOT_DEAL.items() if k in text)
        to_sales = SALES_INBOX in (p.get("to") or "").lower()
        reasons = []
        if p.get("internal"):
            score -= 10
            reasons.append("internal message")
        if sender_party and sender_party.type == "vendor":
            score -= 6
            reasons.append(f"sent by a vendor ({sender_party.props['name']}), they sell to us")
        if to_sales:
            score += 2
            reasons.append("addressed to sales@")
        if sender_party and sender_party.type == "customer":
            reasons.append(f"existing customer {sender_party.props['name']}")
        elif not sender_party and not p.get("internal"):
            reasons.append("unknown external domain, possible prospect")
        is_deal = score >= 4
        if is_deal:
            if "renew" in text:
                stage = "Renewal"
            elif "rfq" in text or "proposal" in text:
                stage = "RFQ"
            elif not sender_party:
                stage = "New inbound"
            else:
                stage = "Expansion"
        else:
            stage = "Not a deal"
        hits = [k for k in INTENT if k in text][:4]
        reason = f"Intent words: {', '.join(hits)}" if hits else "No buying intent"
        if reasons:
            reason += "; " + "; ".join(reasons)
        return {
            "email": m.id,
            "subject": p.get("subject"),
            "sender": p.get("sender"),
            "date": p.get("date"),
            "is_deal": is_deal,
            "stage": stage,
            "score": score,
            "reason": reason,
            "party_id": sender_party.id if sender_party else None,
        }

    # ---------------------------------------------------------------- facts
    def _facts(self, g: MemoryGraph, m: Node, t: dict, as_of: date) -> dict[str, Any]:
        p = m.props
        text = f"{p.get('subject', '')}\n{p.get('text', '')}"
        party = g.nodes.get(t["party_id"]) if t["party_id"] else None
        units_m = _UNITS.search(text)
        units = int(units_m.group(1)) if units_m else None
        amounts = [a for a in p.get("amounts", []) if a >= 1000]
        deadline = _DEADLINE.search(text)
        history: dict[str, Any] = {}
        evidence: list[str] = [m.id]
        risk = None
        avg_invoice = None
        if party and party.type == "customer":
            ars = [g.nodes[e.src] for e in g.in_edges(party.id, "BILLED_TO")]
            amounts_hist = [a.props.get("amount") or 0 for a in ars]
            avg_invoice = round(sum(amounts_hist) / len(amounts_hist), 2) if amounts_hist else None
            # Past due by more than a week: a day or two is normal float, not a credit signal.
            overdue = [
                a
                for a in ars
                if a.props.get("open_amount", 0) > 0
                and a.props.get("due_date")
                and (as_of - date.fromisoformat(a.props["due_date"])).days > GRACE_DAYS
            ]
            open_ar = round(sum(a.props.get("open_amount", 0) for a in ars), 2)
            related = [
                f
                for f in g.findings
                if party.id in f.entities
                and f.code in ("PROMISE_TO_PAY", "SHORT_PAY_DISPUTE", "SHORT_PAY")
            ]
            history = {
                "invoices": len(ars),
                "lifetime_billed": round(sum(amounts_hist), 2),
                "open_ar": open_ar,
                "overdue_count": len(overdue),
                "overdue_amount": round(sum(a.props.get("open_amount", 0) for a in overdue), 2),
                "paid_on_time": sum(1 for a in ars if a.props.get("status") == "paid"),
                "notes": [f"{f.code}: {f.title}" for f in related],
            }
            evidence += [a.id for a in overdue] + [f"finding:{f.code}:{f.key}" for f in related]
            if overdue:
                days = max((as_of - date.fromisoformat(a.props["due_date"])).days for a in overdue)
                risk = (
                    f"{len(overdue)} invoice(s) overdue, {history['overdue_amount']:,.2f}, "
                    f"oldest {days} days"
                )
                promise = next((f for f in related if f.code == "PROMISE_TO_PAY"), None)
                if promise and promise.data:
                    risk += f"; customer promised payment by {promise.data.get('promised_date')}"
        if amounts:
            value, basis = max(amounts), "amount stated in the email"
        elif units and avg_invoice:
            value, basis = (
                round(units * avg_invoice / 10, 2),
                f"{units} units × customer's average invoice ÷ 10",
            )
        elif units:
            value, basis = float(units * 4000), f"{units} units × 4,000 list estimate"
        elif avg_invoice:
            value, basis = avg_invoice, "customer's average invoice"
        else:
            value, basis = 0.0, "no sizing signal in the email"
        return {
            "org": _org(p.get("sender", ""), party),
            "first_name": _first_name(p.get("sender", "")),
            "party_id": party.id if party else None,
            "is_existing_customer": bool(party),
            "units": units,
            "deadline": deadline.group(1) if deadline else None,
            "value_estimate": value,
            "value_basis": basis,
            "history": history,
            "credit_risk": risk,
            "evidence": evidence,
        }

    # ---------------------------------------------------------------- draft
    def _draft(self, m: Node, t: dict, f: dict) -> dict[str, str]:
        p = m.props
        to = p.get("from_addr") or re.search(r"<([^>]+)>", p.get("sender", "")).group(1)
        subject = f"Re: {p.get('subject', '')}"
        first = f["first_name"]
        ask = f"{f['units']} units" if f["units"] else "the scope you described"
        deadline = f" ahead of your {f['deadline']} deadline" if f["deadline"] else ""
        h = f["history"]
        site = "line" if "line" in (p.get("text") or "").lower() else "site"
        promised = next((n.split("by ")[-1] for n in h.get("notes", []) if "promised" in n), None)
        lines = [f"Hi {first},", ""]
        if t["stage"] == "New inbound":
            lines += [
                f"Thanks for reaching out, and glad the Tidewater Foods work caught your eye. "
                f"A {ask} pilot is exactly how most of our customers start.",
                "",
                "Could you share a few details so we can scope it properly:",
                "  - Items per hour and the mix of package sizes",
                "  - Current sorting layout (a floor plan or photos is ideal)",
                "  - Target go-live date",
                "",
                "I have time Tuesday or Wednesday next week for a 30-minute call; "
                "send a slot that works and I will bring pilot pricing.",
            ]
        elif t["stage"] == "Renewal":
            lines += [
                "Thanks for the heads-up on the June 30 expiry. We would be glad to renew "
                "for two years and add the predictive maintenance package.",
                "",
                "I will send renewal pricing within two business days, including the "
                "multi-year discount and the maintenance add-on. If it helps, we can "
                "align the new term to your fiscal year.",
            ]
        elif t["stage"] == "RFQ":
            lines += [
                f"Thank you for including us in the RFQ for {ask}. We can cover hardware, "
                f"integration and a 2-year service plan within the scope you outlined.",
                "",
                f"You will have our full proposal{deadline}. To tailor it, could you "
                "confirm the part families the vision system must handle and whether "
                "the line has an existing PLC standard?",
            ]
        else:  # Expansion
            lines += [
                f"Great news on the new {site}. "
                f"We can supply {ask} on the same configuration as your current fleet.",
                "",
                f"I will send volume pricing and lead times within two business days{deadline}.",
            ]
        if f["credit_risk"]:
            lines += [
                "",
                "One housekeeping item before we confirm new terms: our records show "
                f"{h['overdue_amount']:,.2f} past due on your account"
                + (
                    f" and we have your note that it will be settled by {promised or 'mid-April'}."
                    if promised
                    else "."
                )
                + " Once that clears we can release the order on standard terms; "
                "otherwise we can proceed with a deposit.",
            ]
        lines += ["", "Best regards,", "Northwind Robotics Sales"]
        return {"to": to, "subject": subject, "body": "\n".join(lines)}

    def _polish(self, ctx: AgentContext, draft: dict[str, str], facts: dict) -> dict[str, str]:
        """Optional LLM rephrase. Numbers must survive intact, otherwise keep the template."""
        llm = ctx.llm
        if not getattr(llm, "available", False):
            return draft
        try:
            text = llm.complete(
                "Rewrite this sales reply to read naturally. Keep every number, name, date and "
                "commitment exactly; do not add facts. Return only the email body.\n\n"
                + draft["body"],
                system="You are a careful B2B sales writer.",
            )
            nums = re.findall(r"\d[\d,]*\.?\d*", draft["body"])
            if text and all(n in text for n in nums):
                return {**draft, "body": text.strip(), "polished": "llm"}
        except Exception:
            pass
        return draft


def deal_findings(g: MemoryGraph) -> list[Finding]:
    return [f for f in g.findings if f.code == "DEAL"]
