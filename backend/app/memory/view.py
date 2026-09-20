"""Render the memory graph for the frontend's Data Graph screen.

The screen shows one node per entity (vendor, customer, bank feed, journal
batch, pattern) plus the agents and their findings; clicking an aggregate
expands it into the documents underneath. This module produces exactly that
shape ({nodes, edges, expansions}) from the live graph, so the UI has no
hard-coded data.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.memory.graph import MemoryGraph
    from app.memory.models import Node

AGENTS = [
    ("agent-ap", "AP Agent", "payables", ["AP/AR", "AP"]),
    ("agent-ar", "AR Agent", "receivables", ["AR"]),
    ("agent-recon", "Reconciliation Agent", "reconciliation", ["Cash & Reconciliation"]),
    ("agent-close", "Close Agent", "close", ["Close"]),
    ("agent-forecast", "Forecast Agent", "forecast", ["Forecasting"]),
    ("agent-audit", "Audit Agent", "audit", ["Audit & Controls", "Orchestrator"]),
]

TYPE_LABEL = {
    "invoice": "Invoice",
    "ar_invoice": "Invoice",
    "journal": "Journal entry",
    "bank_txn": "Transaction",
    "email": "Email",
    "scan": "Scanned invoice",
    "bank_account": "Bank account",
    "pattern": "Pattern",
    "finding": "Finding",
    "vendor": "Vendor",
    "customer": "Customer",
    "person": "Person",
}
DOC_RELS = {"RECORDS", "SETTLES", "CLEARS", "MENTIONS", "EXPLAINS", "SCAN_OF", "REMITS_TO"}
_SKIP_PROPS = {
    "text",
    "lines",
    "line_text_by_source",
    "raw",
    "path",
    "period",
    "doc_refs",
    "dates_mentioned",
    "amounts",
    "mentioned_accounts",
}


def _touched(n: Node) -> str:
    p = n.props
    for k in ("date", "posted_date", "posting_date", "invoice_date", "entered_at", "last_seen"):
        if p.get(k):
            return str(p[k])[:10]
    if n.type == "invoice" and p.get("received_at"):
        return str(p["received_at"][-1])[:10]
    return "—"


def _summary(n: Node) -> str:
    p = n.props
    if n.type == "invoice":
        return (
            f"{p.get('vendor_name', '')} · {p.get('currency', 'USD')} {p.get('total', 0):,.2f} · "
            f"{p.get('status', '')} · posted {p.get('posted_count', 0)}x, "
            f"paid {p.get('paid_count', 0)}x"
        )
    if n.type == "ar_invoice":
        return (
            f"{p.get('status', '')} · open {p.get('open_amount', 0):,.2f} "
            f"of {p.get('amount') or 0:,.2f}"
        )
    if n.type == "journal":
        return f"{p.get('kind', '')} · {p.get('amount', 0):,.2f} · {p.get('memo', '')}"
    if n.type == "bank_txn":
        return f"{p.get('amount', 0):,.2f} · {p.get('description', '')}"
    if n.type == "email":
        return f"{p.get('sender', '')}: {p.get('subject', '')}"
    if n.type == "finding":
        return str(p.get("title", ""))
    if n.type == "pattern":
        return str(p.get("text", ""))
    if n.type == "vendor":
        return (
            f"{p.get('invoice_count', 0)} invoices · "
            f"usual remit {p.get('usual_remit_account', '?')}"
        )
    if n.type == "customer":
        return f"{p.get('invoices', 0)} invoices · open AR {p.get('open_ar', 0):,.2f}"
    return ""


def _props(n: Node) -> dict[str, Any]:
    out = {}
    for k, v in n.props.items():
        if k in _SKIP_PROPS or v in (None, "", [], {}):
            continue
        if isinstance(v, (str, int, float, bool)):
            out[k] = v
        elif (
            isinstance(v, list) and len(v) <= 6 and all(isinstance(x, (str, int, float)) for x in v)
        ):
            out[k] = ", ".join(str(x) for x in v)
    return out


def _label(g: MemoryGraph, n: Node) -> str:
    p = n.props
    if n.type == "pattern":
        vendor = g.nodes.get(p.get("vendor_id", ""))
        who = vendor.props.get("name") if vendor else p.get("vendor_id")
        return f"Recurring · {who} {p.get('amount', 0):,.0f}"
    if n.type == "bank_account":
        return f"{p.get('bank') or 'Bank'} ****{p.get('last4', '')}"
    if n.type == "email":
        return p.get("subject") or n.id
    if n.type == "scan":
        return f"Scan {p.get('invoice_ref', '')}"
    return p.get("name") or p.get("number") or n.id


def _ui(g: MemoryGraph, n: Node, group: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": n.id,
        "label": _label(g, n),
        "group": group,
        "type": TYPE_LABEL.get(n.type, n.type),
        "lastTouched": _touched(n),
        "summary": _summary(n),
        "props": _props(n),
        **extra,
    }


def graph_view(g: MemoryGraph) -> dict[str, Any]:
    nodes: list[dict] = []
    edges: list[dict] = []
    expansions: dict[str, dict] = {}
    parent_of: dict[str, str] = {}  # document id -> aggregate id
    group_of: dict[str, str] = {}

    def add_edge(a: str, b: str) -> None:
        if a != b and (a, b) not in seen and (b, a) not in seen:
            seen.add((a, b))
            edges.append({"source": a, "target": b})

    seen: set[tuple[str, str]] = set()
    agent_for: dict[str, str] = {}
    for aid, label, group, names in AGENTS:
        active = any(f.agent in names for f in g.findings)
        nodes.append(
            {
                "id": aid,
                "label": label,
                "group": "agent",
                "isAgent": True,
                "type": "Agent",
                "lastTouched": "live" if active else "idle",
                "summary": f"{sum(f.agent in names for f in g.findings)} findings in memory",
            }
        )
        for nm in names:
            agent_for[nm] = aid
    agent_of_group = {group: aid for aid, _, group, _ in AGENTS}

    # ---- aggregates -------------------------------------------------------
    def aggregate(n: Node, group: str, children: list[Node], agent: str) -> None:
        for c in children:
            parent_of[c.id] = n.id
            group_of[c.id] = group
        group_of[n.id] = group
        nodes.append(_ui(g, n, group, aggregate=bool(children), children=[c.id for c in children]))
        add_edge(agent, n.id)

    for v in sorted((n for n in g.nodes.values() if n.type == "vendor"), key=lambda n: n.id):
        invs = [g.nodes[e.src] for e in g.in_edges(v.id, "ISSUED_BY")]
        aggregate(v, "payables", invs, "agent-ap")
    for c in sorted((n for n in g.nodes.values() if n.type == "customer"), key=lambda n: n.id):
        ars = [g.nodes[e.src] for e in g.in_edges(c.id, "BILLED_TO")]
        aggregate(c, "receivables", ars, "agent-ar")
    op = g.nodes.get("acct:****0042")
    if op:
        txns = sorted(
            (
                g.nodes[e.dst]
                for e in g.out_edges(op.id, "OWNS")
                if g.nodes[e.dst].type == "bank_txn"
            ),
            key=lambda n: n.id,
        )
        aggregate(op, "reconciliation", txns, "agent-recon")
    for p in sorted((n for n in g.nodes.values() if n.type == "period"), key=lambda n: n.id):
        jes = sorted(
            (
                g.nodes[e.src]
                for e in g.in_edges(p.id, "IN_PERIOD")
                if g.nodes[e.src].type == "journal"
                and g.nodes[e.src].props.get("source") in ("MANUAL", "PAYROLL", "BANK")
            ),
            key=lambda n: n.id,
        )
        batch = p.model_copy(update={"props": {**p.props, "name": f"{p.id} journal batch"}})
        aggregate(batch, "close", jes, "agent-close")
    for pat in sorted((n for n in g.nodes.values() if n.type == "pattern"), key=lambda n: n.id):
        group_of[pat.id] = "forecast"
        nodes.append(_ui(g, pat, "forecast"))
        add_edge("agent-forecast", pat.id)
        for e in g.out_edges(pat.id, "ABOUT"):
            add_edge(pat.id, e.dst)

    # ---- findings: link the agent to what it found ------------------------
    for f in g.findings:
        fid = f"finding:{f.code}:{f.key}"
        fn = g.nodes.get(fid)
        if fn is None:
            continue
        agent = agent_for.get(f.agent, "agent-audit")
        group = next(gr for a, _, gr, _ in AGENTS if a == agent)
        group_of[fid] = group
        nodes.append(
            {
                **_ui(g, fn, group),
                "label": f"{f.code} · {f.key}",
                "summary": f.title,
                "props": {
                    "agent": f.agent,
                    "severity": f.severity,
                    "amount": f.amount,
                    "detail": f.detail[:300],
                },
            }
        )
        add_edge(agent, fid)
        for e in g.out_edges(fid):
            target = parent_of.get(e.dst, e.dst)
            if target in group_of or target in agent_of_group.values():
                add_edge(fid, target)

    # ---- expansions: the documents under each aggregate -------------------
    top_ids = {n["id"] for n in nodes}
    for agg in [n for n in nodes if n.get("aggregate")]:
        group = agg["group"]
        exp_nodes: dict[str, dict] = {}
        exp_edges: list[dict] = []
        ekeys: set[tuple[str, str]] = set()

        def eedge(a: str, b: str) -> None:
            if a != b and (a, b) not in ekeys and (b, a) not in ekeys:
                ekeys.add((a, b))
                exp_edges.append({"source": a, "target": b})

        def enode(n: Node) -> None:
            if n.id not in exp_nodes and n.id not in top_ids:
                exp_nodes[n.id] = _ui(g, n, group_of.get(n.id, group))

        for cid in agg["children"]:
            child = g.nodes[cid]
            enode(child)
            eedge(agg["id"], cid)
            for e in g.in_edges(cid) + g.out_edges(cid):
                if e.rel not in DOC_RELS:
                    continue
                other_id = e.src if e.dst == cid else e.dst
                other = g.nodes.get(other_id)
                if other is None or other.type in ("period", "gl_account", "person"):
                    continue
                if other_id in top_ids:
                    eedge(cid, other_id)
                else:
                    enode(other)
                    eedge(cid, other_id)
            for e in g.in_edges(cid, "INVOLVES") + g.in_edges(cid, "EVIDENCED_BY"):
                if e.src in top_ids:
                    eedge(e.src, cid)
        expansions[agg["id"]] = {"nodes": list(exp_nodes.values()), "edges": exp_edges}

    return {
        "nodes": nodes,
        "edges": edges,
        "expansions": expansions,
        "stats": {
            "documents": sum(len(v["nodes"]) for v in expansions.values()),
            "findings": len(g.findings),
        },
    }
