"""DataLake: the storage seam agents read through.

Today it's in-memory lists loaded from DATA_DIR; a future Elasticsearch or
DuckDB backend implements the same methods and agents don't change.
"""

from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

from app.data.loaders import load_bank, load_emails, load_gl, load_invoices
from app.data.models import BankTxn, Email, GLLine, Invoice

if TYPE_CHECKING:
    from app.data.upload import UploadBatch


def _d(s: date | str) -> date:
    return s if isinstance(s, date) else date.fromisoformat(str(s)[:10])


class DataLake:
    def __init__(
        self,
        bank: list[BankTxn],
        gl: list[GLLine],
        invoices: list[Invoice],
        emails: list[Email],
    ) -> None:
        self.bank = bank
        self.gl = gl
        self.invoices = invoices
        self.emails = emails
        self.data_dir: Path | None = None

    @classmethod
    def from_dir(cls, path: Path) -> "DataLake":
        lake = cls(
            bank=load_bank(path),
            gl=load_gl(path),
            invoices=load_invoices(path),
            emails=load_emails(path),
        )
        lake.data_dir = path
        return lake

    def add(self, batch: "UploadBatch") -> dict[str, int]:
        """Merge new rows in (dedupe by natural key, later wins);
        returns rows added/updated per collection."""
        keys = {
            "bank": lambda b: b.txn_id,
            "gl": lambda g: (g.je_id, g.line_no),
            "invoices": lambda i: (i.source, i.invoice_number_norm),
            "emails": lambda e: e.file,
        }
        counts: dict[str, int] = {}
        for name, key in keys.items():
            items: list = getattr(self, name)
            index = {key(it): pos for pos, it in enumerate(items)}
            added = 0
            for it in getattr(batch, name):
                pos = index.get(key(it))
                if pos is None:
                    index[key(it)] = len(items)
                    items.append(it)
                else:
                    items[pos] = it
                added += 1
            if added:
                counts[name] = added
        return counts

    def bank_between(self, start: date | str, end: date | str) -> list[BankTxn]:
        start, end = _d(start), _d(end)
        return sorted(
            (b for b in self.bank if start <= b.posted_date <= end),
            key=lambda b: b.posted_date,
        )

    def gl_lines(
        self,
        account: str,
        start: date | str | None = None,
        end: date | str | None = None,
        exclude_je: tuple[str, ...] = (),
    ) -> list[GLLine]:
        s, e = (_d(start) if start else None), (_d(end) if end else None)
        return [
            g
            for g in self.gl
            if g.account == account
            and g.je_id not in exclude_je
            and (s is None or g.posting_date >= s)
            and (e is None or g.posting_date <= e)
        ]

    def gl_cash_balance(self, as_of: date | str) -> float:
        return round(sum(g.amount for g in self.gl_lines("1000", end=as_of)), 2)

    def invoice_by_ref(self, norm: str | None) -> Invoice | None:
        if not norm:
            return None
        return next((i for i in self.invoices if i.invoice_number_norm == norm), None)

    def emails_with_ref(self, norm: str | None) -> list[Email]:
        if not norm:
            return []
        return [m for m in self.emails if norm in m.doc_refs_norm]

    def emails_with_amount(self, amount: float) -> list[Email]:
        return [m for m in self.emails if amount in m.amounts]
