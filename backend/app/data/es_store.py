"""ElasticStore: thin wrapper over Elasticsearch 8.x used by the optional
elastic storage backend. All index names go through `self.name()` so a prefix
can isolate environments (tests use `test-`)."""

import logging
from typing import Any

from elasticsearch import Elasticsearch, helpers

log = logging.getLogger(__name__)

_SF = {"type": "scaled_float", "scaling_factor": 100}
_KW = {"type": "keyword"}
_TXT = {"type": "text"}
_DATE = {"type": "date"}
_OBJ = {"type": "object", "enabled": False}

_META = {"finertia_schema": 1}
_ORD = {"type": "integer"}

MAPPINGS: dict[str, dict[str, Any]] = {
    "fin-bank": {
        "_meta": _META,
        "properties": {
            "ord": _ORD,
            "txn_id": _KW,
            "posted_date": _DATE,
            "amount": _SF,
            "running_balance": _SF,
            "txn_type": _KW,
            "description": {**_TXT, "fields": {"keyword": _KW}},
            "check_number": _KW,
            "account": _KW,
            "refs_norm": _KW,
        }
    },
    "fin-gl": {
        "_meta": _META,
        "properties": {
            "ord": _ORD,
            "je_id": _KW,
            "line_no": {"type": "integer"},
            "posting_date": _DATE,
            "account": _KW,
            "account_name": _KW,
            "debit": _SF,
            "credit": _SF,
            "amount": _SF,
            "vendor_id": _KW,
            "customer_id": _KW,
            "doc_ref": _KW,
            "doc_ref_norm": _KW,
            "memo": _TXT,
            "source": _KW,
            "posted_by": _KW,
            "approved_by": _KW,
            "entered_at": _KW,
            "check_number": _KW,
        }
    },
    "fin-invoices": {
        "_meta": _META,
        "properties": {
            "ord": _ORD,
            "invoice_number": _KW,
            "invoice_number_norm": _KW,
            "vendor_id": _KW,
            "vendor_name": {**_TXT, "fields": {"keyword": _KW}},
            "vendor_domain": _KW,
            "invoice_date": _DATE,
            "due_date": _DATE,
            "received_at": _KW,
            "currency": _KW,
            "total": _SF,
            "remit_bank": _KW,
            "remit_account": _KW,
            "source": _KW,
            "line_text": _TXT,
            "raw": _OBJ,
        }
    },
    "fin-emails": {
        "_meta": _META,
        "properties": {
            "ord": _ORD,
            "file": _KW,
            "sent_at": _KW,
            "sender": _TXT,
            "from_domain": _KW,
            "to": _KW,
            "subject": _TXT,
            "body": _TXT,
            "amounts": _SF,
            "doc_refs_norm": _KW,
        }
    },
    "agent-memory": {
        "_meta": _META,
        "properties": {
            "agent": _KW,
            "code": _KW,
            "key": _KW,
            "severity": _KW,
            "title": _TXT,
            "detail": _TXT,
            "amount": _SF,
            "entities": _KW,
            "evidence": _KW,
            "created_at": _DATE,
            "proposed_je": _OBJ,
            "data": _OBJ,
        }
    },
    "memory-graph": {
        "_meta": _META,
        "properties": {
            "src": _KW,
            "rel": _KW,
            "dst": _KW,
            "agent": _KW,
            "finding_node": _KW,
            "created_at": _KW,
            "props": _OBJ,
        }
    },
    "memory-nodes": {
        "_meta": _META,
        "properties": {
            "id": _KW,
            "type": _KW,
            "text": _TXT,
            "props": _OBJ,
        }
    },
}


class ElasticStore:
    def __init__(self, url: str, api_key: str | None = None, prefix: str = "") -> None:
        kwargs: dict[str, Any] = {"request_timeout": 15}
        if api_key:
            kwargs["api_key"] = api_key
        self.es = Elasticsearch(url, **kwargs)
        self.prefix = prefix

    def name(self, index: str) -> str:
        return self.prefix + index

    def ping(self) -> bool:
        try:
            return bool(self.es.ping())
        except Exception:
            return False

    def exists(self, index: str) -> bool:
        return bool(self.es.indices.exists(index=self.name(index)))

    def schema_ok(self, index: str) -> bool:
        """True iff the index exists and carries our `_meta.finertia_schema` marker —
        guards against starting on indices built by another app/shape."""
        name = self.name(index)
        if not self.es.indices.exists(index=name):
            return False
        mapping = self.es.indices.get_mapping(index=name)
        meta = mapping[name].get("mappings", {}).get("_meta", {})
        return meta.get("finertia_schema") == _META["finertia_schema"]

    def create_index(self, index: str, mappings: dict, recreate: bool = False) -> None:
        name = self.name(index)
        if recreate and self.es.indices.exists(index=name):
            self.es.indices.delete(index=name)
        if not self.es.indices.exists(index=name):
            self.es.indices.create(index=name, mappings=mappings)

    def delete_index(self, index: str) -> None:
        name = self.name(index)
        if self.es.indices.exists(index=name):
            self.es.indices.delete(index=name)

    def bulk(self, index: str, docs: list[dict], id_field: str | None = None) -> None:
        actions = []
        for d in docs:
            a: dict[str, Any] = {"_index": self.name(index), "_source": d}
            if id_field and d.get(id_field) is not None:
                a["_id"] = str(d[id_field])
            actions.append(a)
        if actions:
            helpers.bulk(self.es, actions, refresh=True)

    def index(self, index: str, doc: dict, id: str | None = None) -> None:  # noqa: A002
        self.es.index(index=self.name(index), id=id, document=doc, refresh=True)

    def delete_by_query(self, index: str, query: dict) -> None:
        self.es.delete_by_query(
            index=self.name(index), query=query, refresh=True, conflicts="proceed"
        )

    def search(
        self,
        index: str,
        query: dict | None = None,
        size: int = 10000,
        sort: list | None = None,
        source: list[str] | None = None,
    ) -> list[dict]:
        body: dict[str, Any] = {"query": query or {"match_all": {}}, "size": size}
        if sort:
            body["sort"] = sort
        if source:
            body["_source"] = source
        res = self.es.search(index=self.name(index), **body)
        return [dict(h["_source"], _score=h.get("_score")) for h in res["hits"]["hits"]]

    def count(self, index: str) -> int:
        name = self.name(index)
        if not self.es.indices.exists(index=name):
            return 0
        return int(self.es.count(index=name)["count"])

    def agg_sum(self, index: str, field: str, query: dict | None = None) -> float:
        res = self.es.search(
            index=self.name(index),
            query=query or {"match_all": {}},
            size=0,
            aggs={"total": {"sum": {"field": field}}},
        )
        return float(res["aggregations"]["total"]["value"] or 0.0)
