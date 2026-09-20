"""Load the raw finance sources into typed models.

Ported from the finance-agent-lab ingest.py, minus Elasticsearch and OCR:

    raw source                          -> model
    general_ledger.parquet   (columnar) -> GLLine
    bank_transactions.csv    (flat)     -> BankTxn
    vendor_invoices.jsonl    (3 schemas)-> Invoice   (normalized to one schema, raw kept)
    emails/*.eml             (text)     -> Email     (entities extracted: amounts, doc refs, domain)

The `load_*` functions read the canonical files under a data dir; the `parse_*`
functions do the row-level work so uploads can feed the same pipeline.
"""

import csv
import email
import email.policy
import json
import re
from collections.abc import Iterable
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

import pyarrow.parquet as pq

from app.data.models import BankTxn, Email, GLLine, Invoice

DOC_REF = re.compile(r"\b(?:[A-Z]{2,4}-?(?:\d{4}-)?\d{2,5})\b")
MONEY = re.compile(r"(?:\$|USD\s?|EUR\s?)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)")
CHECK_NO = re.compile(r"Check #(\d+)")

BANK_REQUIRED = {"txn_id", "posted_date", "amount", "running_balance", "txn_type", "description"}
GL_REQUIRED = {"je_id", "line_no", "posting_date", "account", "debit", "credit"}
INVOICE_SOURCES = {"vendor_portal", "email_ingest", "edi_810"}


def norm_ref(s: object) -> str | None:
    return re.sub(r"[^A-Z0-9]", "", str(s).upper()) if s else None


def _to_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def parse_gl_rows(rows: Iterable[dict]) -> list[GLLine]:
    out = []
    for r in rows:
        debit = float(r.get("debit") or 0)
        credit = float(r.get("credit") or 0)
        memo = r.get("memo") or ""
        m = CHECK_NO.search(memo)
        out.append(
            GLLine(
                je_id=r["je_id"],
                line_no=int(r["line_no"]),
                posting_date=_to_date(r["posting_date"]),
                account=r["account"],
                account_name=r.get("account_name") or "",
                debit=debit,
                credit=credit,
                amount=round(debit - credit, 2),
                vendor_id=r.get("vendor_id") or None,
                customer_id=r.get("customer_id") or None,
                doc_ref=r.get("doc_ref") or None,
                doc_ref_norm=norm_ref(r.get("doc_ref")),
                memo=memo,
                source=r.get("source") or "",
                posted_by=r.get("posted_by") or "",
                approved_by=r.get("approved_by") or None,
                entered_at=r.get("entered_at") or "",
                check_number=m.group(1) if m else None,
            )
        )
    return out


def load_gl(data_dir: Path) -> list[GLLine]:
    return parse_gl_rows(pq.read_table(data_dir / "general_ledger.parquet").to_pylist())


def parse_bank_rows(rows: Iterable[dict]) -> list[BankTxn]:
    out = []
    for r in rows:
        out.append(
            BankTxn(
                txn_id=r["txn_id"],
                posted_date=r["posted_date"],
                amount=float(r["amount"]),
                running_balance=float(r["running_balance"]),
                txn_type=r["txn_type"],
                description=r["description"],
                check_number=r.get("check_number") or None,
                account=r.get("account", ""),
                refs_norm=[norm_ref(x) for x in DOC_REF.findall(r["description"])],
            )
        )
    return out


def load_bank(data_dir: Path) -> list[BankTxn]:
    with open(data_dir / "bank_transactions.csv", newline="") as f:
        return parse_bank_rows(csv.DictReader(f))


def parse_invoices(
    raws: list[dict], name_to_id: dict[str, str] | None = None
) -> list[Invoice]:
    """Three vendor schemas -> one. The 'semi-structured' problem in miniature."""
    name_to_id = dict(name_to_id or {})
    for r in raws:
        if r["source"] == "vendor_portal":
            name_to_id[r["vendor"]["name"]] = r["vendor"]["id"]
        elif r["source"] == "edi_810":
            name_to_id[r["party"]["N1_VN"]] = r["party"]["vendor_code"]
    out = []
    for r in raws:
        if r["source"] == "vendor_portal":
            d = dict(
                invoice_number=r["invoice_number"],
                vendor_id=r["vendor"]["id"],
                vendor_name=r["vendor"]["name"],
                vendor_domain=r["vendor"]["email"].split("@")[1],
                invoice_date=r["invoice_date"],
                due_date=r["due_date"],
                currency=r["currency"],
                total=r["total"],
                remit_bank=r["remit_to"]["bank"],
                remit_account=r["remit_to"]["account_masked"],
                line_text=" | ".join(line["description"] for line in r["lines"]),
            )
        elif r["source"] == "email_ingest":
            inv_date = datetime.strptime(r["date"], "%m/%d/%Y").date()
            terms = int(re.search(r"\d+", r["terms"]).group())
            bank, acct = r["bank_details"].rsplit(" acct ", 1)
            d = dict(
                invoice_number=r["inv_no"],
                vendor_id=name_to_id.get(r["vendor_name"]),
                vendor_name=r["vendor_name"],
                vendor_domain=r["from_email"].split("@")[1],
                invoice_date=inv_date.isoformat(),
                due_date=(inv_date + timedelta(days=terms)).isoformat(),
                currency=r["ccy"],
                total=r["amount_due"],
                remit_bank=bank,
                remit_account=acct,
                line_text=" | ".join(line["desc"] for line in r["line_items"]),
            )
        else:  # edi_810
            inv_date = datetime.strptime(r["doc"]["BIG01"], "%Y%m%d").date()
            d = dict(
                invoice_number=r["doc"]["BIG02"],
                vendor_id=r["party"]["vendor_code"],
                vendor_name=r["party"]["N1_VN"],
                vendor_domain=None,
                invoice_date=inv_date.isoformat(),
                due_date=None,
                currency=r["currency"],
                total=int(r["TDS_total_cents"]) / 100,
                remit_bank=None,
                remit_account=r["remit_account"],
                line_text=" | ".join(i["IT1_desc"] for i in r["items"]),
            )
        d.update(
            source=r["source"],
            received_at=r["received_at"],
            invoice_number_norm=norm_ref(d["invoice_number"]),
            raw=r,
        )
        out.append(Invoice(**d))
    return out


def load_invoices(data_dir: Path) -> list[Invoice]:
    raws = [json.loads(line) for line in open(data_dir / "vendor_invoices.jsonl")]
    return parse_invoices(raws)


def parse_eml(name: str, data: bytes) -> Email:
    msg = email.message_from_bytes(data, policy=email.policy.default)
    body = msg.get_body(preferencelist=("plain",)).get_content()
    frm = str(msg["From"])
    text = f"{msg['Subject']}\n{body}"
    return Email(
        file=name,
        sent_at=parsedate_to_datetime(msg["Date"]).isoformat(),
        sender=frm,
        from_domain=re.search(r"@([\w.\-]+)", frm).group(1).lower(),
        to=str(msg["To"]),
        subject=str(msg["Subject"]),
        body=body,
        amounts=[float(a.replace(",", "")) for a in MONEY.findall(text)],
        doc_refs_norm=sorted({norm_ref(r) for r in DOC_REF.findall(text)}),
    )


def load_emails(data_dir: Path) -> list[Email]:
    return [
        parse_eml(p.name, p.read_bytes())
        for p in sorted((data_dir / "emails").glob("*.eml"))
    ]
