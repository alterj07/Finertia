"""Tools the chatbot can call. Each returns a JSON-serialisable dict that
always carries "citations": the graph node ids the result touched, so the UI
can show the evidence behind an answer.
"""

import re
from dataclasses import dataclass
from typing import Any, Callable, Literal

from app.agents.base import AgentContext
from app.agents.feedback import Adjustment
from app.agents.orchestrator import Orchestrator
from app.agents.registry import AgentRegistry


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    fn: Callable[..., Any]

    def openai_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


def _summary(props: dict[str, Any]) -> str:
    parts = []
    for k in ("title", "name", "description", "memo", "subject", "amount", "total",
              "posted_date", "posting_date", "invoice_date", "code", "key"):
        v = props.get(k)
        if v not in (None, "", []):
            parts.append(f"{k}={v}")
    return ", ".join(parts)[:120]


_NUMBER_WORDS = {
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
}
_TOKEN = re.compile(r"[a-z0-9]+")


def _normalise_query(query: str) -> str:
    """'three invoices' -> '3 invoices': number words become digits so they
    match finding text written with numerals."""
    return " ".join(_NUMBER_WORDS.get(w, w) for w in query.lower().split())


def _match_findings(g, query: str, k: int = 5) -> list[dict[str, Any]]:
    """Simple token-overlap match over finding title/detail/key."""
    terms = set(_TOKEN.findall(query.lower()))
    if not terms:
        return []
    scored = []
    for f in g.findings:
        hay = set(_TOKEN.findall(f"{f.title} {f.detail} {f.key}".lower()))
        score = len(terms & hay)
        if score:
            scored.append((score, f))
    scored.sort(key=lambda x: (-x[0], x[1].created_at))
    return [
        {
            "node_id": f"finding:{f.code}:{f.key}",
            "code": f.code,
            "key": f.key,
            "title": f.title,
            "amount": f.amount,
        }
        for _, f in scored[:k]
    ]


_LINK_COUNT_TYPES = {"bank_txn", "journal", "invoice"}


def _str_schema(props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required or []}


def build_tools(
    ctx: AgentContext, registry: AgentRegistry, orchestrator: Orchestrator
) -> list[Tool]:
    g = ctx.memory

    def search_memory(
        query: str, types: list[str] | None = None, k: int = 10
    ) -> dict[str, Any]:
        norm = _normalise_query(query)
        hits = g.search(norm, types=types, k=k)
        findings = _match_findings(g, norm)
        nodes = []
        for s, n in hits:
            item: dict[str, Any] = {
                "id": n.id,
                "type": n.type,
                "score": s,
                "summary": _summary(n.props),
            }
            if n.type in _LINK_COUNT_TYPES:
                links: dict[str, int] = {}
                for e in g.out_edges(n.id):
                    links[e.rel] = links.get(e.rel, 0) + 1
                item["links"] = links
            nodes.append(item)
        return {
            "findings": findings,
            "nodes": nodes,
            "citations": [n.id for _, n in hits] + [f["node_id"] for f in findings],
        }

    def get_context(node_id: str, depth: int = 2) -> dict[str, Any]:
        nid = g.resolve(node_id)
        c = g.context(nid, depth=depth)
        node_ids = [n["id"] for n in c["nodes"]]
        return {
            "text": c["text"],
            "node_ids": node_ids,
            "findings": [
                {"code": f["code"], "key": f["key"], "title": f["title"], "amount": f["amount"]}
                for f in c["findings"]
            ],
            "citations": node_ids,
        }

    def get_findings(code: str | None = None, agent: str | None = None) -> dict[str, Any]:
        findings = g.recall(code=code, agent=agent)
        return {
            "findings": [
                {
                    "code": f.code,
                    "key": f.key,
                    "title": f.title,
                    "detail": f.detail,
                    "severity": f.severity,
                    "amount": f.amount,
                    "entities": f.entities,
                    "evidence": f.evidence,
                    "node_id": f"finding:{f.code}:{f.key}",
                }
                for f in findings
            ],
            "citations": [f"finding:{f.code}:{f.key}" for f in findings],
        }

    def get_precedents(party: str) -> dict[str, Any]:
        p = g.precedents(party)
        cited = [party]
        if p.get("party"):
            cited = [p["party"]["id"]]
        cited += [d["id"] for d in p.get("documents", [])]
        return {**p, "citations": cited}

    def get_signals(period: str | None = None, agent: str | None = None) -> dict[str, Any]:
        signals = [s.model_dump(mode="json") for s in g.signals(period=period, agent=agent)][:25]
        cited = sorted({e for s in signals for e in s["entities"] + s["evidence"]})
        return {"signals": signals, "citations": cited}

    def list_agents() -> dict[str, Any]:
        return {"agents": [s.model_dump() for s in registry.specs()], "citations": []}

    def run_orchestrator(
        request: str, defaults: dict | None = None
    ) -> dict[str, Any]:
        result = orchestrator.run(ctx, request, defaults=defaults)
        return {
            "plan": result.plan.model_dump(),
            "results": [
                {
                    "agent": r.agent,
                    "summary": {k: v for k, v in r.summary.items() if k != "matches"},
                    "findings": [
                        {
                            "code": f.code,
                            "key": f.key,
                            "title": f.title,
                            "amount": f.amount,
                            "severity": f.severity,
                        }
                        for f in r.findings
                    ],
                }
                for r in result.results
            ],
            "citations": [
                f"finding:{f.code}:{f.key}" for r in result.results for f in r.findings
            ],
        }

    def record_feedback(
        agent: str,
        kind: Literal["rule_param", "pin_match", "block_match", "reclassify", "note"],
        payload: dict,
        reason: str,
    ) -> dict[str, Any]:
        if agent not in registry.names():
            return {
                "error": f"unknown agent {agent!r}; registered: {registry.names()}",
                "citations": [],
            }
        adj = ctx.feedback.add(
            Adjustment(agent=agent, kind=kind, payload=payload, reason=reason)
        )
        return {
            "adjustment": adj.model_dump(mode="json"),
            "citations": [f"adjustment:{adj.id}"],
        }

    def list_feedback(agent: str | None = None) -> dict[str, Any]:
        items = ctx.feedback.for_agent(agent) if agent else ctx.feedback.adjustments
        return {
            "adjustments": [a.model_dump(mode="json") for a in items],
            "citations": [f"adjustment:{a.id}" for a in items],
        }

    return [
        Tool(
            name="search_memory",
            description="Keyword search over graph nodes AND agent findings. Findings are "
            "conclusions; nodes are raw evidence. Check `links` counts before claiming "
            "how many items a bank line matched.",
            parameters=_str_schema(
                {
                    "query": {"type": "string", "description": "keywords, names, refs or amounts"},
                    "types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "optional node types to restrict to",
                    },
                    "k": {"type": "integer", "default": 10},
                },
                required=["query"],
            ),
            fn=search_memory,
        ),
        Tool(
            name="get_context",
            description="Read the neighbourhood around a node: its props, direct links and "
            "prior findings, rendered as text. Accepts any doc-ref spelling.",
            parameters=_str_schema(
                {
                    "node_id": {"type": "string"},
                    "depth": {"type": "integer", "default": 2},
                },
                required=["node_id"],
            ),
            fn=get_context,
        ),
        Tool(
            name="get_findings",
            description="List findings agents have already written to shared memory, "
            "optionally filtered by code and/or agent.",
            parameters=_str_schema(
                {
                    "code": {"type": "string"},
                    "agent": {"type": "string"},
                }
            ),
            fn=get_findings,
        ),
        Tool(
            name="get_precedents",
            description="Everything known about a vendor/customer: documents, patterns, "
            "bank accounts used, and past findings.",
            parameters=_str_schema({"party": {"type": "string"}}, required=["party"]),
            fn=get_precedents,
        ),
        Tool(
            name="get_signals",
            description="Structural leads the graph surfaces on its own (anomalies not yet "
            "confirmed as findings).",
            parameters=_str_schema(
                {"period": {"type": "string"}, "agent": {"type": "string"}}
            ),
            fn=get_signals,
        ),
        Tool(
            name="list_agents",
            description="List the registered specialist agents and their parameter schemas.",
            parameters=_str_schema({}),
            fn=list_agents,
        ),
        Tool(
            name="run_orchestrator",
            description="Run specialist agent(s) for a request (e.g. 'reconcile Q1'). "
            "Use only when the user asks to run, re-run, reconcile or close.",
            parameters=_str_schema(
                {
                    "request": {"type": "string"},
                    "defaults": {"type": "object"},
                },
                required=["request"],
            ),
            fn=run_orchestrator,
        ),
        Tool(
            name="record_feedback",
            description="Record a tuning Adjustment for an agent (pin/block a match, "
            "change a rule param, reclassify, or a note). Applies on the next run.",
            parameters=_str_schema(
                {
                    "agent": {"type": "string"},
                    "kind": {
                        "type": "string",
                        "enum": [
                            "rule_param",
                            "pin_match",
                            "block_match",
                            "reclassify",
                            "note",
                        ],
                    },
                    "payload": {"type": "object"},
                    "reason": {"type": "string"},
                },
                required=["agent", "kind", "payload", "reason"],
            ),
            fn=record_feedback,
        ),
        Tool(
            name="list_feedback",
            description="List recorded tuning adjustments, optionally filtered by agent.",
            parameters=_str_schema({"agent": {"type": "string"}}),
            fn=list_feedback,
        ),
    ]
