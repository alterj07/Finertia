"""ingest_lake: load the DataLake document collections into Elasticsearch.

Recreates the fin-* indices with our mappings and bulk-indexes each pydantic
model. Run standalone with `uv run python -m app.data.ingest`.
"""

import sys
from typing import Any

from app.config import settings
from app.data.es_store import MAPPINGS, ElasticStore
from app.data.lake import DataLake

_FIN = ["fin-bank", "fin-gl", "fin-invoices", "fin-emails"]


def _docs(models: list[Any]) -> list[dict]:
    # `ord` preserves the local loader order — seed() is order-dependent
    return [{**m.model_dump(mode="json"), "ord": i} for i, m in enumerate(models)]


def ingest_lake(lake: DataLake, store: ElasticStore) -> dict[str, int]:
    for index in _FIN:
        store.create_index(index, MAPPINGS[index], recreate=True)
    store.bulk("fin-bank", _docs(lake.bank), id_field="txn_id")
    store.bulk(
        "fin-gl",
        [{**d, "_doc_id": f"{d['je_id']}:{d['line_no']}"} for d in _docs(lake.gl)],
        id_field="_doc_id",
    )
    store.bulk(
        "fin-invoices",
        [
            {**d, "_doc_id": f"{d['source']}:{d['invoice_number_norm']}"}
            for d in _docs(lake.invoices)
        ],
        id_field="_doc_id",
    )
    store.bulk("fin-emails", _docs(lake.emails), id_field="file")
    return {index: store.count(index) for index in _FIN}


def main() -> int:
    if not settings.data_dir.is_dir():
        print(f"DATA_DIR {settings.data_dir} does not exist", file=sys.stderr)
        return 1
    store = ElasticStore(
        settings.es_url,
        api_key=settings.es_api_key.get_secret_value() if settings.es_api_key else None,
        prefix=settings.es_index_prefix,
    )
    if not store.ping():
        print(f"Elasticsearch unreachable at {settings.es_url}", file=sys.stderr)
        return 1
    lake = DataLake.from_dir(settings.data_dir)
    for index, count in ingest_lake(lake, store).items():
        print(f"{index:15} {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
