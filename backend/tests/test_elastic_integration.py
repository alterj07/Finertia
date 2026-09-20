"""Integration tests against a real Elasticsearch at ES_URL (localhost:9200).

Uses index prefix `test-` so the lab indices are never touched; all test-*
indices are deleted at teardown. Skips entirely when ES is unreachable.
"""

import os
from pathlib import Path

import pytest

pytest.importorskip("elasticsearch")

from app.agents.base import AgentContext  # noqa: E402
from app.agents.feedback import FeedbackStore  # noqa: E402
from app.agents.recon.agent import CashReconAgent  # noqa: E402
from app.data.es_lake import ElasticDataLake  # noqa: E402
from app.data.es_store import (
    MAPPINGS,  # noqa: E402
    ElasticStore,  # noqa: E402
)
from app.data.ingest import ingest_lake  # noqa: E402
from app.data.lake import DataLake  # noqa: E402
from app.memory.es_sync import ElasticMemorySync  # noqa: E402
from app.memory.graph import MemoryGraph  # noqa: E402
from app.memory.models import Finding  # noqa: E402

ES_URL = os.environ.get("ES_URL", "http://localhost:9200")
PREFIX = "test-"


@pytest.fixture(scope="module")
def store():
    s = ElasticStore(ES_URL, prefix=PREFIX)
    if not s.ping():
        pytest.skip(f"Elasticsearch not reachable at {ES_URL}")
    yield s
    for name in ("fin-bank", "fin-gl", "fin-invoices", "fin-emails",
                 "agent-memory", "memory-graph", "memory-nodes"):
        s.delete_index(name)


@pytest.fixture(scope="module")
def es_lake(store, data_dir: Path):
    ingest_lake(DataLake.from_dir(data_dir), store)
    return ElasticDataLake(store, data_dir=data_dir)


def test_ingest_counts(store, es_lake) -> None:
    assert store.count("fin-bank") == 55
    assert store.count("fin-gl") == 252
    assert store.count("fin-invoices") == 34
    assert store.count("fin-emails") == 12


def test_bank_between_matches_local(es_lake, data_dir: Path) -> None:
    local = DataLake.from_dir(data_dir)
    es_ids = [b.txn_id for b in es_lake.bank_between("2026-01-01", "2026-03-31")]
    local_ids = [b.txn_id for b in local.bank_between("2026-01-01", "2026-03-31")]
    assert es_ids == local_ids


def test_gl_cash_balance_matches_local(es_lake, data_dir: Path) -> None:
    local = DataLake.from_dir(data_dir)
    assert es_lake.gl_cash_balance("2026-03-31") == pytest.approx(
        local.gl_cash_balance("2026-03-31"), abs=0.01
    )


def test_invoice_by_ref(es_lake) -> None:
    inv = es_lake.invoice_by_ref("BP4471")
    assert inv is not None
    assert inv.currency == "EUR"


def test_emails_with_amount(es_lake) -> None:
    files = {m.file for m in es_lake.emails_with_amount(58339.68)}
    assert "006_helios_remittance.eml" in files


def test_recon_parity(es_lake, tmp_path) -> None:
    ctx = AgentContext(
        lake=es_lake,
        memory=MemoryGraph(tmp_path / "memory_graph.json"),
        feedback=FeedbackStore(tmp_path / "feedback.json"),
    )
    result = CashReconAgent().run(ctx)
    assert result.summary["adjusted_bank"] == pytest.approx(428321.64, abs=0.01)
    assert result.summary["difference"] == 0.0


def test_memory_sync(store, es_lake, tmp_path) -> None:
    memory = MemoryGraph(tmp_path / "memory_graph.json")
    memory.seed(es_lake)
    memory.attach_sync(ElasticMemorySync(store))
    assert store.count("memory-nodes") == len(memory.nodes)

    memory.remember(
        Finding(
            agent="Cash & Reconciliation",
            code="TEST_FINDING",
            key="BK00001",
            title="test finding",
            entities=["BK00001"],
        )
    )
    assert store.count("agent-memory") == 1
    edge_docs = store.search(
        "memory-graph",
        {"term": {"finding_node": "finding:TEST_FINDING:BK00001"}},
    )
    assert len(edge_docs) >= 1

    hits = memory.search("HELIOS REMIT 88213", k=5)
    assert any(n.id == "BK00044" for _, n in hits)


def test_seed_parity(store, es_lake, data_dir: Path, tmp_path) -> None:
    es_graph = MemoryGraph(tmp_path / "es.json").seed(es_lake)
    local_graph = MemoryGraph(tmp_path / "local.json").seed(
        DataLake.from_dir(data_dir)
    )
    assert es_graph.stats() == local_graph.stats()


def test_schema_ok_rejects_alien_index(store, data_dir: Path) -> None:
    store.es.indices.delete(index=store.name("fin-bank"), ignore_unavailable=True)
    store.es.indices.create(
        index=store.name("fin-bank"),
        mappings={"properties": {"from": {"type": "text"}}},
    )
    store.es.index(
        index=store.name("fin-bank"), document={"from": "x"}, refresh=True
    )
    assert not store.schema_ok("fin-bank")
    # restore for other tests / app restarts
    ingest_lake(DataLake.from_dir(data_dir), store)


def test_attach_sync_backfills_findings(store, es_lake, tmp_path) -> None:
    memory = MemoryGraph(tmp_path / "memory_graph.json")
    memory.seed(es_lake)
    memory.remember(
        Finding(
            agent="Cash & Reconciliation",
            code="BACKFILL",
            key="BK00002",
            title="remembered before attach",
            entities=["BK00002"],
        )
    )
    for idx in ("agent-memory", "memory-graph", "memory-nodes"):
        store.create_index(idx, MAPPINGS[idx], recreate=True)
    memory.attach_sync(ElasticMemorySync(store))
    assert store.count("agent-memory") == 1
    assert (
        store.count("memory-graph")
        == len([e for e in memory.edges if e.finding_node])
    )
