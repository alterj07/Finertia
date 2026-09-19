from datetime import date
from typing import Any

from pydantic import BaseModel


class BankTxn(BaseModel):
    txn_id: str
    posted_date: date
    amount: float
    running_balance: float
    txn_type: str
    description: str
    check_number: str | None = None
    account: str = ""
    refs_norm: list[str] = []


class GLLine(BaseModel):
    je_id: str
    line_no: int
    posting_date: date
    account: str
    account_name: str = ""
    debit: float = 0.0
    credit: float = 0.0
    amount: float = 0.0
    vendor_id: str | None = None
    customer_id: str | None = None
    doc_ref: str | None = None
    doc_ref_norm: str | None = None
    memo: str = ""
    source: str = ""
    posted_by: str = ""
    approved_by: str | None = None
    entered_at: str = ""
    check_number: str | None = None  # parsed from memo "Check #NNNN"


class Invoice(BaseModel):
    invoice_number: str
    invoice_number_norm: str | None = None
    vendor_id: str | None = None
    vendor_name: str = ""
    vendor_domain: str | None = None
    invoice_date: date
    due_date: date | None = None
    received_at: str = ""
    currency: str = "USD"
    total: float = 0.0
    remit_bank: str | None = None
    remit_account: str | None = None
    source: str = ""
    line_text: str = ""
    raw: dict[str, Any] = {}


class Email(BaseModel):
    file: str
    sent_at: str
    sender: str
    from_domain: str
    to: str = ""
    subject: str = ""
    body: str = ""
    amounts: list[float] = []
    doc_refs_norm: list[str] = []
