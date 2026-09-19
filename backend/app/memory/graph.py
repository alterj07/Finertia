"""MemoryGraph: the shared institutional memory all agents (and later the
orchestrator) connect to. Persisted as a single JSON file.

Mirrors the lab's Memory.remember: each finding becomes a node
`finding:{code}:{key}` with INVOLVES edges to entities, EVIDENCED_BY edges to
evidence, plus any explicit relations.
"""

import json
import re
from pathlib import Path
from typing import Any, Iterable

from app.memory.models import Edge, Finding, Node


def _node_type(node_id: str) -> str:
    if node_id.startswith("finding:"):
        return "finding"
    if node_id.startswith("BK"):
        return "bank_txn"
    if node_id.startswith("JE-"):
        return "journal"
    if node_id.endswith(".eml"):
        return "email"
    if re.fullmatch(r"[VC]\d{3}", node_id):
        return "party"
    if node_id.isdigit():
        return "reference"
    # doc refs (AR-1052, INV7781, BP-4471 ...) mix letters and digits
    if any(c.isalpha() for c in node_id) and any(c.isdigit() for c in node_id):
        return "invoice"
    return "entity"


class MemoryGraph:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []
        self.findings: list[Finding] = []
        if path and path.exists():
            self.load(path)

    def load(self, path: Path) -> None:
        data = json.loads(path.read_text())
        self.nodes = {n["id"]: Node(**n) for n in data.get("nodes", [])}
        self.edges = [Edge(**e) for e in data.get("edges", [])]
        self.findings = [Finding(**f) for f in data.get("findings", [])]
        self.path = path

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.to_dict(), indent=2, default=str))

    def reset(self) -> None:
        self.nodes.clear()
        self.edges.clear()
        self.findings.clear()
        self.save()

    def upsert_node(self, node_id: str, type: str | None = None, **props: Any) -> Node:
        node = self.nodes.get(node_id)
        if node is None:
            node = Node(id=node_id, type=type or _node_type(node_id))
            self.nodes[node_id] = node
        node.props.update(props)
        return node

    def remember(
        self,
        finding: Finding,
        relations: Iterable[tuple[str, str, str]] = (),
    ) -> Finding:
        node_id = f"finding:{finding.code}:{finding.key}"
        # idempotent: replace an existing finding with the same identity
        # (agent, code, key) and drop the edges its previous remember() wrote
        self.findings = [
            f
            for f in self.findings
            if not (
                f.agent == finding.agent and f.code == finding.code and f.key == finding.key
            )
        ]
        self.edges = [e for e in self.edges if e.finding_node != node_id]
        self.findings.append(finding)
        self.upsert_node(
            node_id,
            type="finding",
            agent=finding.agent,
            code=finding.code,
            title=finding.title,
            severity=finding.severity,
            amount=finding.amount,
        )
        edges = [Edge(src=node_id, rel="INVOLVES", dst=e) for e in finding.entities]
        edges += [Edge(src=node_id, rel="EVIDENCED_BY", dst=e) for e in finding.evidence]
        edges += [Edge(src=s, rel=r, dst=t) for s, r, t in relations]
        for e in edges:
            e.agent = finding.agent
            e.created_at = finding.created_at.isoformat()
            e.finding_node = node_id
            self.upsert_node(e.src)
            self.upsert_node(e.dst)
            self.edges.append(e)
        self.save()
        return finding

    def recall(
        self,
        code: str | None = None,
        agent: str | None = None,
        text: str | None = None,
    ) -> list[Finding]:
        out = self.findings
        if code:
            out = [f for f in out if f.code == code]
        if agent:
            out = [f for f in out if f.agent == agent]
        if text:
            terms = text.lower().split()
            out = [
                f for f in out if all(t in f"{f.title} {f.detail}".lower() for t in terms)
            ]
        return out

    def neighbors(self, node_id: str, depth: int = 2) -> list[Edge]:
        seen, frontier, edges = {node_id}, {node_id}, []
        keys: set[tuple[str, str, str]] = set()
        for _ in range(depth):
            nxt: set[str] = set()
            for n in frontier:
                for e in self.edges:
                    if e.src != n and e.dst != n:
                        continue
                    key = (e.src, e.rel, e.dst)
                    if key not in keys:
                        keys.add(key)
                        edges.append(e)
                    for m in (e.src, e.dst):
                        if m not in seen:
                            seen.add(m)
                            nxt.add(m)
            frontier = nxt
        return edges

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes": [n.model_dump() for n in self.nodes.values()],
            "edges": [e.model_dump() for e in self.edges],
            "findings": [f.model_dump(mode="json") for f in self.findings],
        }
