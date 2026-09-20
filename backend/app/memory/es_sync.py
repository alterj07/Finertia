"""ElasticMemorySync: mirrors MemoryGraph writes into Elasticsearch.

Optional — attach to a MemoryGraph with `graph.attach_sync(...)`. The JSON file
remains the source of truth; ES is a replica used for search and cross-process
sharing.
"""

import logging
import re
from typing import Any, Iterable

from app.data.es_store import MAPPINGS, ElasticStore
from app.memory.models import Edge, Finding, Node


def _clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if not k.startswith("_")}

log = logging.getLogger(__name__)

_TOKEN = re.compile(r"[a-z0-9]+(?:[.\-][a-z0-9]+)*")
_MEM_INDICES = ["agent-memory", "memory-graph", "memory-nodes"]


def _flat(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(f"{k} {_flat(v)}" for k, v in value.items())
    if isinstance(value, list):
        return " ".join(_flat(v) for v in value)
    return str(value)


def _node_text(node: Node) -> str:
    parts = [node.id, node.type, _flat(node.props)]
    text = " ".join(parts)
    # add normalised spellings so "inv-7781" matches a search for "inv7781"
    extra = []
    for t in _TOKEN.findall(text.lower()):
        bare = re.sub(r"[^a-z0-9]", "", t)
        if bare != t:
            extra.append(bare)
        if re.fullmatch(r"\d+\.\d{2}", t):
            extra.append(t.split(".")[0])
    return text + (" " + " ".join(extra) if extra else "")


class ElasticMemorySync:
    def __init__(self, store: ElasticStore) -> None:
        self.store = store

    def ensure_indices(self) -> None:
        for index in _MEM_INDICES:
            # recreate when missing or carrying a foreign/legacy mapping
            self.store.create_index(
                index, MAPPINGS[index], recreate=not self.store.schema_ok(index)
            )

    def on_reset(self) -> None:
        for index in _MEM_INDICES:
            self.store.create_index(index, MAPPINGS[index], recreate=True)

    def on_remember(self, finding: Finding, node_id: str, edges: list[Edge]) -> None:
        self.store.index(
            "agent-memory",
            finding.model_dump(mode="json"),
            id=node_id,
        )
        self.store.delete_by_query(
            "memory-graph", {"term": {"finding_node": node_id}}
        )
        self.store.bulk(
            "memory-graph",
            [e.model_dump(mode="json") for e in edges],
        )

    def index_nodes(self, nodes: Iterable[Node]) -> None:
        self.store.bulk(
            "memory-nodes",
            [
                {
                    "id": n.id,
                    "type": n.type,
                    "text": _node_text(n),
                    "props": n.props,
                }
                for n in nodes
            ],
            id_field="id",
        )

    def load(self) -> tuple[list[Node], list[Edge], list[Finding]]:
        """Read the whole memory layer back out of ES (nodes, edges, findings),
        deterministically sorted."""
        nodes = [
            Node(id=d["id"], type=d["type"], props=d.get("props", {}))
            for d in self.store.search("memory-nodes")
        ]
        nodes.sort(key=lambda n: n.id)
        edges = []
        seen: set[tuple] = set()
        for d in self.store.search("memory-graph"):
            e = Edge(**_clean(d))
            key = (e.src, e.rel, e.dst, e.finding_node)
            if key not in seen:
                seen.add(key)
                edges.append(e)
        edges.sort(key=lambda e: (e.finding_node or "", e.src, e.rel, e.dst))
        findings = [
            Finding(**_clean(d)) for d in self.store.search("agent-memory")
        ]
        findings.sort(key=lambda f: (f.created_at, f.code, f.key))
        return nodes, edges, findings

    def search(
        self, query: str, types: list[str] | None = None, k: int = 10
    ) -> list[tuple[float, str]]:
        q: dict[str, Any] = {
            "multi_match": {
                "query": query,
                "fields": ["id^3", "text"],
                "type": "best_fields",
                "fuzziness": "AUTO",
            }
        }
        if types:
            q = {
                "bool": {
                    "must": [q],
                    "filter": [{"terms": {"type": list(types)}}],
                }
            }
        res = self.store.es.search(
            index=self.store.name("memory-nodes"),
            query=q,
            size=k,
            _source=["id"],
        )
        return [(float(h["_score"]), h["_source"]["id"]) for h in res["hits"]["hits"]]
