"""ElasticDataLake: the DataLake seam implemented over Elasticsearch.

Agents call the same methods; only the storage changes. The list attributes
(bank/gl/invoices/emails) still work — memory.seed() reads them — by pulling
every doc once and caching.
"""

from datetime import date
from functools import cached_property
from typing import TYPE_CHECKING, Any

from app.data.es_store import MAPPINGS, ElasticStore
from app.data.ingest import docs_for
from app.data.lake import DataLake, _d
from app.data.models import BankTxn, Email, GLLine, Invoice

if TYPE_CHECKING:
    from app.data.upload import UploadBatch


def _strip(doc: dict) -> dict:
    return {
        k: v
        for k, v in doc.items()
        if not k.startswith("_") and k != "ord"
    }


class ElasticDataLake(DataLake):
    def __init__(self, store: ElasticStore, data_dir=None) -> None:
        self.store = store
        # scans are seeded straight from DATA_DIR/scanned_invoices, not from ES
        self.data_dir = data_dir

    # ------------------------------------------------- full-collection views
    @cached_property
    def bank(self) -> list[BankTxn]:
        docs = self.store.search("fin-bank", sort=[{"ord": "asc"}])
        return [BankTxn(**_strip(d)) for d in docs]

    @cached_property
    def gl(self) -> list[GLLine]:
        docs = self.store.search("fin-gl", sort=[{"ord": "asc"}])
        return [GLLine(**_strip(d)) for d in docs]

    @cached_property
    def invoices(self) -> list[Invoice]:
        docs = self.store.search("fin-invoices", sort=[{"ord": "asc"}])
        return [Invoice(**_strip(d)) for d in docs]

    @cached_property
    def emails(self) -> list[Email]:
        docs = self.store.search("fin-emails", sort=[{"ord": "asc"}])
        return [Email(**_strip(d)) for d in docs]

    # ------------------------------------------------------------- uploads
    def add(self, batch: "UploadBatch") -> dict[str, int]:
        """Upsert uploaded rows into the fin-* indices (same doc ids as ingest,
        so re-uploading replaces rather than duplicates) and drop the cached
        collection views."""
        counts: dict[str, int] = {}
        for collection in ("bank", "gl", "invoices", "emails"):
            models = getattr(batch, collection)
            if not models:
                continue
            index = f"fin-{collection}"
            self.store.create_index(index, MAPPINGS[index])
            docs, id_field = docs_for(
                collection, models, ord_start=self.store.count(index)
            )
            self.store.bulk(index, docs, id_field=id_field)
            counts[collection] = len(docs)
        for k in ("bank", "gl", "invoices", "emails"):
            self.__dict__.pop(k, None)
        return counts

    # ------------------------------------------------------- query methods
    def bank_between(self, start: date | str, end: date | str) -> list[BankTxn]:
        q = {
            "range": {
                "posted_date": {
                    "gte": _d(start).isoformat(),
                    "lte": _d(end).isoformat(),
                }
            }
        }
        docs = self.store.search("fin-bank", query=q, sort=[{"posted_date": "asc"}])
        return [BankTxn(**_strip(d)) for d in docs]

    def gl_lines(
        self,
        account: str,
        start: date | str | None = None,
        end: date | str | None = None,
        exclude_je: tuple[str, ...] = (),
    ) -> list[GLLine]:
        filters: list[dict[str, Any]] = [{"term": {"account": account}}]
        rng: dict[str, str] = {}
        if start:
            rng["gte"] = _d(start).isoformat()
        if end:
            rng["lte"] = _d(end).isoformat()
        if rng:
            filters.append({"range": {"posting_date": rng}})
        q: dict[str, Any] = {"bool": {"filter": filters}}
        if exclude_je:
            q["bool"]["must_not"] = [{"terms": {"je_id": list(exclude_je)}}]
        docs = self.store.search("fin-gl", query=q)
        return [GLLine(**_strip(d)) for d in docs]

    def gl_cash_balance(self, as_of: date | str) -> float:
        q = {
            "bool": {
                "filter": [
                    {"term": {"account": "1000"}},
                    {"range": {"posting_date": {"lte": _d(as_of).isoformat()}}},
                ]
            }
        }
        return round(self.store.agg_sum("fin-gl", "amount", q), 2)

    def invoice_by_ref(self, norm: str | None) -> Invoice | None:
        if not norm:
            return None
        docs = self.store.search(
            "fin-invoices", query={"term": {"invoice_number_norm": norm}}, size=1
        )
        return Invoice(**_strip(docs[0])) if docs else None

    def emails_with_ref(self, norm: str | None) -> list[Email]:
        if not norm:
            return []
        docs = self.store.search(
            "fin-emails", query={"term": {"doc_refs_norm": norm}}
        )
        return [Email(**_strip(d)) for d in docs]

    def emails_with_amount(self, amount: float) -> list[Email]:
        docs = self.store.search("fin-emails", query={"term": {"amounts": amount}})
        return [Email(**_strip(d)) for d in docs]
