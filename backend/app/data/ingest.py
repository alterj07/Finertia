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

_ID_FIELDS = {
    "fin-bank": "txn_id",
    "fin-gl": "_doc_id",
    "fin-invoices": "_doc_id",
    "fin-emails": "file",
}


def docs_for(
    collection: str, models: list[Any], ord_start: int = 0
) -> tuple[list[dict], str]:
    """Shape pydantic models into bulk docs: `ord` (loader/upload order),
    `_doc_id` for collections whose natural key is composite."""
    index = f"fin-{collection}"
    docs = [
        {**m.model_dump(mode="json"), "ord": ord_start + i}
        for i, m in enumerate(models)
    ]
    if collection == "gl":
        docs = [{**d, "_doc_id": f"{d['je_id']}:{d['line_no']}"} for d in docs]
    elif collection == "invoices":
        docs = [
            {**d, "_doc_id": f"{d['source']}:{d['invoice_number_norm']}"}
            for d in docs
        ]
    return docs, _ID_FIELDS[index]


def ingest_lake(lake: DataLake, store: ElasticStore) -> dict[str, int]:
    for index in _FIN:
        store.create_index(index, MAPPINGS[index], recreate=True)
    for collection in ("bank", "gl", "invoices", "emails"):
        docs, id_field = docs_for(collection, getattr(lake, collection))
        store.bulk(f"fin-{collection}", docs, id_field=id_field)
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
