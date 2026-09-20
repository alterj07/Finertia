"""MemoryGraph: the shared institutional memory all agents (and later the
orchestrator) connect to. Persisted as a single JSON file.

Two layers live in one graph:

* base layer (agent="ingest") — every document and relationship seeded from the
  DataLake by `app.memory.seed`: invoices, journal entries, bank lines, emails,
  scans, parties, accounts, periods, plus derived patterns. Rebuilt on start.
* memory layer — what agents/humans write with `remember`: each finding becomes
  a node `finding:{code}:{key}` with INVOLVES edges to entities and EVIDENCED_BY
  edges to evidence. Persisted and replayed.

Agents read with `context` (a node's neighbourhood rendered for a prompt),
`search` (keyword search over everything), `signals` (structural leads) and
`recall` (past findings).
"""

import json
import logging
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Iterable

from app.memory.models import Edge, Finding, Node, Signal

log = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.data.lake import DataLake
    from app.memory.es_sync import ElasticMemorySync

_TOKEN = re.compile(r"[a-z0-9]+(?:[.\-][a-z0-9]+)*")


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


def _tokens(text: str) -> list[str]:
    out = []
    for t in _TOKEN.findall(text.lower()):
        out.append(t)
        bare = re.sub(r"[^a-z0-9]", "", t)
        if bare != t:
            out.append(bare)  # inv-7781 also matches inv7781
        if re.fullmatch(r"\d+\.\d{2}", t):
            out.append(t.split(".")[0])  # 12400.00 also matches 12400
    return out


class MemoryGraph:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []
        self.findings: list[Finding] = []
        self.aliases: dict[str, str] = {}  # norm ref -> canonical node id
        self.sync: ElasticMemorySync | None = None
        if path and path.exists():
            self.load(path)

    # ----------------------------------------------------------- persistence
    def load(self, path: Path) -> None:
        data = json.loads(path.read_text())
        self.nodes = {n["id"]: Node(**n) for n in data.get("nodes", [])}
        self.edges = [Edge(**e) for e in data.get("edges", [])]
        self.findings = [Finding(**f) for f in data.get("findings", [])]
        self.aliases = data.get("aliases", {})
        self.path = path

    def save(self) -> None:
        if self.path is None or self.sync is not None:
            return  # ES is the store when a sync is attached
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.to_dict(), indent=2, default=str))

    def reset(self) -> None:
        """Forget everything the agents wrote; the base layer is kept."""
        self.findings.clear()
        self.edges = [e for e in self.edges if e.agent == "ingest"]
        keep = {e.src for e in self.edges} | {e.dst for e in self.edges}
        self.nodes = {
            k: n
            for k, n in self.nodes.items()
            if n.type != "finding" and (k in keep or n.type != "entity")
        }
        self.save()
        if self.sync:
            self.sync.on_reset()

    def seed(self, lake: "DataLake") -> "MemoryGraph":
        from app.memory.seed import seed_from_lake

        seed_from_lake(self, lake)
        self.save()
        if self.sync:
            self.sync.index_nodes(self.nodes.values())
        return self

    def attach_sync(self, sync: "ElasticMemorySync", load: bool = True) -> None:
        """Attach Elasticsearch as the shared memory store.

        With `load` (default), ES is authoritative for the memory layer:
        findings and finding-written edges come from ES; locally-seeded nodes
        keep their props (ES only adds nodes the seed didn't create). Then all
        nodes are (re-)indexed and findings backfilled — idempotent.
        """
        self.sync = sync
        # load before ensure_indices: a schema-mismatched index gets recreated
        # (wiped), so read whatever valid data exists first
        if load:
            try:
                nodes, edges, findings = sync.load()
            except Exception as exc:
                log.warning("ES memory load failed; starting fresh: %s", exc)
                nodes, edges, findings = [], [], []
        sync.ensure_indices()
        if load:
            for n in nodes:
                if n.id not in self.nodes:
                    self.nodes[n.id] = n
            # ES is authoritative for findings it knows; local findings that
            # never reached ES are kept (and pushed by the backfill below)
            es_ids = {(f.agent, f.code, f.key) for f in findings}
            local_only = [
                f
                for f in self.findings
                if (f.agent, f.code, f.key) not in es_ids
            ]
            local_only_nodes = {f"finding:{f.code}:{f.key}" for f in local_only}
            self.findings = findings + local_only
            self.edges = [
                e
                for e in self.edges
                if e.finding_node is None or e.finding_node in local_only_nodes
            ] + edges
        sync.index_nodes(self.nodes.values())
        for f in self.findings:
            node_id = f"finding:{f.code}:{f.key}"
            f_edges = [e for e in self.edges if e.finding_node == node_id]
            sync.on_remember(f, node_id, f_edges)

    # ------------------------------------------------------------ mutation
    def upsert_node(self, node_id: str, type: str | None = None, **props: Any) -> Node:
        node = self.nodes.get(node_id)
        if node is None:
            node = Node(id=node_id, type=type or _node_type(node_id))
            self.nodes[node_id] = node
        elif type and node.type in ("entity", "party", "invoice", "reference"):
            node.type = type  # a placeholder created by remember() gets its real type
        node.props.update(props)
        return node

    def alias(self, norm: str | None, node_id: str) -> None:
        if norm:
            self.aliases[norm] = node_id

    def resolve(self, ref: str | None) -> str:
        """Map any spelling of a document number to its canonical node id."""
        if not ref:
            return ""
        if ref in self.nodes:
            return ref
        norm = re.sub(r"[^A-Z0-9]", "", str(ref).upper())
        return self.aliases.get(norm, ref)

    def link(self, src: str, rel: str, dst: str, agent: str = "ingest", **props: Any) -> Edge:
        """Idempotent base-layer edge: same (src, rel, dst) updates props."""
        existing = self.edge(src, rel, dst)
        if existing:
            existing.props.update(props)
            return existing
        e = Edge(src=src, rel=rel, dst=dst, agent=agent, props=props)
        self.upsert_node(src)
        self.upsert_node(dst)
        self.edges.append(e)
        return e

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
            if not (f.agent == finding.agent and f.code == finding.code and f.key == finding.key)
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
            status="open",
            text=f"{finding.title} {finding.detail}",
        )
        edges = [Edge(src=node_id, rel="INVOLVES", dst=self.resolve(e)) for e in finding.entities]
        edges += [
            Edge(src=node_id, rel="EVIDENCED_BY", dst=self.resolve(e)) for e in finding.evidence
        ]
        edges += [Edge(src=self.resolve(s), rel=r, dst=self.resolve(t)) for s, r, t in relations]
        for e in edges:
            e.agent = finding.agent
            e.created_at = finding.created_at.isoformat()
            e.finding_node = node_id
            self.upsert_node(e.src)
            self.upsert_node(e.dst)
            self.edges.append(e)
        self.save()
        if self.sync:
            self.sync.on_remember(finding, node_id, edges)
            touched = {node_id} | {e.src for e in edges} | {e.dst for e in edges}
            self.sync.index_nodes(self.nodes[i] for i in touched if i in self.nodes)
        return finding

    # --------------------------------------------------------------- reads
    def edge(self, src: str, rel: str, dst: str) -> Edge | None:
        return next((e for e in self.edges if e.src == src and e.rel == rel and e.dst == dst), None)

    def out_edges(self, node_id: str, rel: str | None = None) -> list[Edge]:
        return [e for e in self.edges if e.src == node_id and (rel is None or e.rel == rel)]

    def in_edges(self, node_id: str, rel: str | None = None) -> list[Edge]:
        return [e for e in self.edges if e.dst == node_id and (rel is None or e.rel == rel)]

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
            out = [f for f in out if all(t in f"{f.title} {f.detail}".lower() for t in terms)]
        return out

    HUB_TYPES = {"period", "gl_account", "company", "person", "agent"}

    def neighbors(self, node_id: str, depth: int = 2) -> list[Edge]:
        """Edges within `depth` hops. Hub nodes (periods, GL accounts, people) are
        reached but never expanded, so a context stays about the focus node."""
        node_id = self.resolve(node_id)
        seen, frontier, edges = {node_id}, {node_id}, []
        keys: set[tuple[str, str, str]] = set()
        for _ in range(depth):
            nxt: set[str] = set()
            for n in frontier:
                node = self.nodes.get(n)
                if (
                    n != node_id
                    and node
                    and (node.type in self.HUB_TYPES or n.startswith("acct:****0042"))
                ):
                    continue
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

    def search(
        self, query: str, types: list[str] | None = None, k: int = 10
    ) -> list[tuple[float, Node]]:
        """BM25-style keyword search over ids, props and free text of every node."""
        if self.sync:
            try:
                hits = self.sync.search(query, types=types, k=k)
                return [(s, self.nodes[i]) for s, i in hits if i in self.nodes]
            except Exception as exc:
                log.warning("ES search failed, falling back to local BM25: %s", exc)
        q = set(_tokens(query))
        if not q:
            return []
        docs: dict[str, dict[str, int]] = {}
        df: dict[str, int] = defaultdict(int)
        for n in self.nodes.values():
            if types and n.type not in types:
                continue
            parts = [n.id, n.type]
            for key, v in n.props.items():
                if isinstance(v, (str, int, float)) and len(str(v)) < 2000:
                    parts.append(f"{key} {v}")
                elif isinstance(v, list):
                    parts.append(" ".join(str(x) for x in v if isinstance(x, (str, int, float))))
            counts: dict[str, int] = defaultdict(int)
            for t in _tokens(" ".join(parts)):
                counts[t] += 1
            docs[n.id] = counts
            for t in counts:
                df[t] += 1
        n_docs = max(len(docs), 1)
        avg = sum(sum(c.values()) for c in docs.values()) / n_docs
        scored = []
        for nid, counts in docs.items():
            s = 0.0
            dl = sum(counts.values())
            for t in q:
                tf = counts.get(t)
                if not tf:
                    continue
                idf = math.log(1 + (n_docs - df[t] + 0.5) / (df[t] + 0.5))
                s += idf * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * dl / avg))
            if s:
                scored.append((round(s, 3), self.nodes[nid]))
        scored.sort(key=lambda x: -x[0])
        return scored[:k]

    def signals(self, period: str | None = None, agent: str | None = None) -> list[Signal]:
        from app.memory.signals import all_signals

        return all_signals(self, period=period, agent=agent)

    def context(self, node_id: str, depth: int = 2, max_nodes: int = 60) -> dict[str, Any]:
        """Everything the graph knows around a node, plus a prompt-ready rendering."""
        node_id = self.resolve(node_id)
        focus = self.nodes.get(node_id)
        if focus is None:
            return {
                "focus": None,
                "nodes": [],
                "edges": [],
                "findings": [],
                "text": f"Unknown node {node_id}",
            }
        edges = self.neighbors(node_id, depth)
        ids: list[str] = [node_id]
        for e in edges:
            for m in (e.src, e.dst):
                if m not in ids:
                    ids.append(m)
        ids = ids[:max_nodes]
        keep = set(ids)
        edges = [e for e in edges if e.src in keep and e.dst in keep]
        nodes = [self.nodes[i] for i in ids if i in self.nodes]
        findings = [f for f in self.findings if f"finding:{f.code}:{f.key}" in keep]
        return {
            "focus": focus.model_dump(),
            "nodes": [n.model_dump() for n in nodes],
            "edges": [e.model_dump() for e in edges],
            "findings": [f.model_dump(mode="json") for f in findings],
            "text": self._render(focus, nodes, edges, findings),
        }

    def _render(
        self, focus: Node, nodes: list[Node], edges: list[Edge], findings: list[Finding]
    ) -> str:
        skip = {"text", "lines", "line_text_by_source", "raw", "path"}

        def brief(n: Node) -> str:
            bits = [
                f"{k}={v}"
                for k, v in n.props.items()
                if k not in skip and v not in (None, [], {}, "") and len(str(v)) <= 80
            ]
            return f"{n.id} [{n.type}] " + ", ".join(bits[:10])

        by_type: dict[str, list[Node]] = defaultdict(list)
        for n in nodes:
            if n.id != focus.id:
                by_type[n.type].append(n)
        out = [f"# {brief(focus)}"]
        if focus.props.get("text"):
            out.append(str(focus.props["text"])[:800])
        for rel_edges in ((e for e in edges if e.src == focus.id or e.dst == focus.id),):
            out.append("\n## Direct links")
            for e in rel_edges:
                other = e.dst if e.src == focus.id else e.src
                arrow = f"-{e.rel}->" if e.src == focus.id else f"<-{e.rel}-"
                p = ", ".join(f"{k}={v}" for k, v in e.props.items() if len(str(v)) <= 60)
                out.append(f"- {arrow} {other}" + (f" ({p})" if p else ""))
        for t, ns in sorted(by_type.items()):
            out.append(f"\n## {t} ({len(ns)})")
            out.extend(f"- {brief(n)}" for n in ns[:15])
        if findings:
            out.append("\n## Prior findings")
            out.extend(f"- [{f.agent}] {f.code} {f.key}: {f.title}" for f in findings)
        return "\n".join(out)

    def precedents(self, party_id: str) -> dict[str, Any]:
        """What we already know about a vendor/customer: history, patterns, past findings."""
        party_id = self.resolve(party_id)
        docs = [
            self.nodes[e.src]
            for e in self.in_edges(party_id)
            if e.rel in ("ISSUED_BY", "BILLED_TO")
        ]
        patterns = [self.nodes[e.src] for e in self.in_edges(party_id, "ABOUT")]
        related = {party_id} | {d.id for d in docs}
        findings = [f for f in self.findings if related & set(self.resolve(x) for x in f.entities)]
        return {
            "party": self.nodes[party_id].model_dump() if party_id in self.nodes else None,
            "documents": sorted(
                (d.model_dump() for d in docs), key=lambda d: str(d["props"].get("invoice_date"))
            ),
            "patterns": [p.model_dump() for p in patterns],
            "accounts": [e.model_dump() for e in self.out_edges(party_id, "USES_ACCOUNT")],
            "findings": [f.model_dump(mode="json") for f in findings],
        }

    # --------------------------------------------------------------- export
    def stats(self) -> dict[str, Any]:
        by_node: dict[str, int] = defaultdict(int)
        for n in self.nodes.values():
            by_node[n.type] += 1
        by_edge: dict[str, int] = defaultdict(int)
        for e in self.edges:
            by_edge[e.rel] += 1
        return {
            "nodes": len(self.nodes),
            "edges": len(self.edges),
            "findings": len(self.findings),
            "node_types": dict(sorted(by_node.items())),
            "edge_types": dict(sorted(by_edge.items())),
        }

    def to_dict(self, types: list[str] | None = None, period: str | None = None) -> dict[str, Any]:
        nodes = [
            n
            for n in self.nodes.values()
            if (types is None or n.type in types)
            and (period is None or n.props.get("period") in (period, None))
        ]
        ids = {n.id for n in nodes}
        return {
            "nodes": [n.model_dump() for n in nodes],
            "edges": [e.model_dump() for e in self.edges if e.src in ids and e.dst in ids],
            "findings": [f.model_dump(mode="json") for f in self.findings],
            "aliases": self.aliases if types is None and period is None else {},
        }
