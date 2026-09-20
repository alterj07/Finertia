"""Scanned-invoice OCR: read the committed cache and parse invoice fields.

`data/scanned_invoices/ocr.json` is produced offline by scripts/ocr_scans.py
(RapidOCR). Parsing is plain regex over the recognised text, so the same scan
always yields the same fields — no model call at runtime.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_INVOICE_NO = re.compile(r"\b([A-Z]{2,4}-?\d{2,5}(?:-\d{1,3})?)\b")
_ISO_DATE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_TOTAL = re.compile(r"TOTAL\s*DUE\s*\(?\s*([A-Z]{3})\s*\)?\s*([\d,]+\.\d{2})", re.I)
_CURRENCY = re.compile(r"\b(USD|EUR|GBP|CAD)\b")
_REMIT = re.compile(r"\*{4}\s*(\d{4})\b")
_EMAIL = re.compile(r"[\w.+-]+@([\w.-]+\.\w+)")
_AMOUNT = re.compile(r"^\s*([\d,]+\.\d{2})\s*$")
_LABELS = (
    "Invoice No",
    "Invoice Date",
    "Due Date",
    "Bill To",
    "Currency",
    "Description",
    "Amount",
    "TOTAL DUE",
    "Remit payment",
    "Thank you",
    "INVOICE",
)


def load_ocr_cache(data_dir: Path) -> dict[str, dict[str, Any]]:
    path = data_dir / "scanned_invoices" / "ocr.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def parse_invoice_fields(text: str) -> dict[str, Any]:
    """Structured fields from OCR text of a vendor invoice scan."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    m_total = _TOTAL.search(text)
    dates = _ISO_DATE.findall(text)
    remit = _REMIT.search(text)
    email = _EMAIL.search(text)
    number = None
    for ln in lines:
        m = _INVOICE_NO.search(ln)
        if m and not _ISO_DATE.search(ln):
            number = m.group(1)
            break
    currency = m_total.group(1).upper() if m_total else None
    if not currency:
        m_ccy = _CURRENCY.search(text)
        currency = m_ccy.group(1) if m_ccy else None
    amounts = [float(m.group(1).replace(",", "")) for ln in lines if (m := _AMOUNT.match(ln))]
    total = float(m_total.group(2).replace(",", "")) if m_total else None
    line_amounts = [a for a in amounts if total is None or abs(a - total) > 0.005]
    return {
        "vendor_name": lines[0] if lines and not any(k in lines[0] for k in _LABELS) else None,
        "vendor_domain": email.group(1).lower() if email else None,
        "number": number,
        "invoice_date": dates[0] if dates else None,
        "due_date": dates[1] if len(dates) > 1 else None,
        "currency": currency,
        "total": total,
        "line_amounts": line_amounts,
        "lines_sum": round(sum(line_amounts), 2) if line_amounts else None,
        "remit_account": remit.group(1) if remit else None,
    }
