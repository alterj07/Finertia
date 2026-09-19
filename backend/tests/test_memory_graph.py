from pathlib import Path

from app.memory.graph import MemoryGraph
from app.memory.models import Finding


def _finding() -> Finding:
    return Finding(
        agent="Cash & Reconciliation",
        code="FX_DIFFERENCE",
        key="BP-4471",
        title="test finding",
        amount=72.0,
        entities=["V001", "BP-4471"],
        evidence=["BK00010", "JE-2001"],
    )


def test_remember_creates_node_and_edges(tmp_path: Path) -> None:
    g = MemoryGraph(tmp_path / "g.json")
    g.remember(_finding())
    node_id = "finding:FX_DIFFERENCE:BP-4471"
    assert node_id in g.nodes
    assert g.nodes[node_id].type == "finding"
    rels = {(e.src, e.rel, e.dst) for e in g.edges}
    assert (node_id, "INVOLVES", "V001") in rels
    assert (node_id, "EVIDENCED_BY", "BK00010") in rels
    assert g.nodes["BK00010"].type == "bank_txn"
    assert g.nodes["JE-2001"].type == "journal"


def test_neighbors_depth(tmp_path: Path) -> None:
    g = MemoryGraph(tmp_path / "g.json")
    g.remember(_finding(), relations=[("V001", "ISSUED", "BP-4471")])
    edges = g.neighbors("finding:FX_DIFFERENCE:BP-4471", depth=1)
    assert len(edges) == 4  # 2 INVOLVES + 2 EVIDENCED_BY
    deeper = g.neighbors("finding:FX_DIFFERENCE:BP-4471", depth=2)
    assert any(e.rel == "ISSUED" for e in deeper)


def test_save_load_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "g.json"
    g = MemoryGraph(path)
    g.remember(_finding())
    g2 = MemoryGraph(path)
    assert len(g2.findings) == 1
    assert g2.findings[0].key == "BP-4471"
    assert set(g2.nodes) == set(g.nodes)
    assert len(g2.edges) == len(g.edges)


def test_remember_is_idempotent(tmp_path: Path) -> None:
    g = MemoryGraph(tmp_path / "g.json")
    g.remember(_finding(), relations=[("V001", "ISSUED", "BP-4471")])
    n_edges = len(g.edges)
    g.remember(_finding(), relations=[("V001", "ISSUED", "BP-4471")])
    assert len(g.findings) == 1
    assert len(g.edges) == n_edges
    # a changed finding still replaces, not duplicates
    updated = _finding().model_copy(update={"severity": "high"})
    g.remember(updated)
    assert len(g.findings) == 1
    assert g.findings[0].severity == "high"


def test_recall_filters(tmp_path: Path) -> None:
    g = MemoryGraph(tmp_path / "g.json")
    g.remember(_finding())
    assert g.recall(code="FX_DIFFERENCE")
    assert not g.recall(code="NOPE")
    assert g.recall(agent="Cash & Reconciliation")
    assert g.recall(text="test finding")
