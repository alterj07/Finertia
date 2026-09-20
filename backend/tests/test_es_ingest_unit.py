"""Unit test for ingest_lake — no Elasticsearch required (RecordingStore fake)."""

from pathlib import Path

import pytest

from app.data.es_store import ElasticStore
from app.data.ingest import ingest_lake
from app.data.lake import DataLake


class RecordingStore:
    def __init__(self) -> None:
        self.created: list[tuple[str, dict, bool]] = []
        self.bulked: list[tuple[str, list[dict], str | None]] = []

    def create_index(self, name, mappings, recreate=False):
        self.created.append((name, mappings, recreate))

    def bulk(self, name, docs, id_field=None):
        self.bulked.append((name, docs, id_field))

    def count(self, name):
        counts = dict.fromkeys((n for n, _, _ in self.bulked), 0)
        for n, docs, _ in self.bulked:
            counts[n] = len(docs)
        return counts.get(name, 0)


def test_ingest_lake_calls(data_dir: Path) -> None:
    lake = DataLake.from_dir(data_dir)
    store = RecordingStore()
    counts = ingest_lake(lake, store)

    assert [c[0] for c in store.created] == [
        "fin-bank",
        "fin-gl",
        "fin-invoices",
        "fin-emails",
    ]
    assert all(c[2] for c in store.created)  # recreate=True
    assert [b[0] for b in store.bulked] == [
        "fin-bank",
        "fin-gl",
        "fin-invoices",
        "fin-emails",
    ]

    bank = store.bulked[0][1]
    assert "BK00001" in {d["txn_id"] for d in bank}
    gl = store.bulked[1][1]
    assert "JE-1000:1" in {d["_doc_id"] for d in gl}
    emails = store.bulked[3][1]
    assert "001_brightline_resend.eml" in {d["file"] for d in emails}

    assert counts["fin-bank"] == len(bank)
    assert counts["fin-gl"] == len(gl)


def test_ingest_lake_needs_data(data_dir: Path) -> None:
    if not data_dir.is_dir():
        pytest.skip("no DATA_DIR")


class _FakeIndices:
    def __init__(self, meta):
        self._meta = meta

    def exists(self, index):
        return True

    def get_mapping(self, index):
        return {index: {"mappings": {"_meta": self._meta}}}


def _store_with_meta(meta) -> ElasticStore:
    store = ElasticStore.__new__(ElasticStore)
    store.prefix = ""
    store.es = type("FakeES", (), {"indices": _FakeIndices(meta)})()
    return store


def test_schema_ok() -> None:
    assert _store_with_meta({"finertia_schema": 1}).schema_ok("fin-bank")
    assert not _store_with_meta({}).schema_ok("fin-bank")
    assert not _store_with_meta({"finertia_schema": 2}).schema_ok("fin-bank")
