"""Classify and parse uploaded files into the finance data collections.

`inspect_files` is pure: it takes (name, bytes) pairs — from a multipart form,
a zip member, or a folder drop — and returns a per-file report plus the parsed
models. Nothing touches the lake; the API layer decides whether to commit.
"""

import csv
import io
import json
import zipfile
from typing import Literal

import pyarrow.parquet as pq
from pydantic import BaseModel

from app.data.loaders import (
    BANK_REQUIRED,
    GL_REQUIRED,
    INVOICE_SOURCES,
    parse_bank_rows,
    parse_eml,
    parse_gl_rows,
    parse_invoices,
)
from app.data.models import BankTxn, Email, GLLine, Invoice

MAX_BYTES = 50 * 1024 * 1024
ACCEPTED = ".csv (bank or GL), .parquet (GL), .jsonl/.json (invoices), .eml (emails), .zip"
Kind = Literal["bank", "gl", "invoices", "emails", "ignored"]

_IGNORED_NAMES = {"thumbs.db", "desktop.ini"}


class FileReport(BaseModel):
    name: str
    kind: Kind | None = None  # None = incompatible
    rows: int = 0
    ok: bool
    error: str | None = None


class UploadBatch(BaseModel):
    bank: list[BankTxn] = []
    gl: list[GLLine] = []
    invoices: list[Invoice] = []
    emails: list[Email] = []


class UploadReport(BaseModel):
    files: list[FileReport]
    ok: bool
    counts: dict[str, int]


def _ignored(name: str) -> bool:
    base = name.rsplit("/", 1)[-1].lower()
    return base.startswith(".") or base in _IGNORED_NAMES or "__macosx/" in name.lower()


def _parse_csv(name: str, data: bytes, batch: UploadBatch) -> FileReport:
    try:
        reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig"), newline=""))
        header = set(reader.fieldnames or [])
    except (UnicodeDecodeError, csv.Error) as exc:
        return FileReport(name=name, ok=False, error=f"not readable as CSV: {exc}")
    if BANK_REQUIRED <= header:
        kind: Kind = "bank"
    elif GL_REQUIRED <= header:
        kind = "gl"
    else:
        return FileReport(
            name=name,
            ok=False,
            error=(
                "CSV header matches neither bank feed "
                f"(missing: {', '.join(sorted(BANK_REQUIRED - header))}) "
                "nor general ledger "
                f"(missing: {', '.join(sorted(GL_REQUIRED - header))})"
            ),
        )
    try:
        rows = parse_bank_rows(reader) if kind == "bank" else parse_gl_rows(reader)
    except (KeyError, ValueError, TypeError) as exc:
        n = reader.line_num
        return FileReport(name=name, kind=kind, ok=False, error=f"row {n}: {exc}")
    (batch.bank if kind == "bank" else batch.gl).extend(rows)
    return FileReport(name=name, kind=kind, rows=len(rows), ok=True)


def _parse_parquet(name: str, data: bytes, batch: UploadBatch) -> FileReport:
    try:
        table = pq.read_table(io.BytesIO(data))
    except Exception as exc:
        return FileReport(name=name, ok=False, error=f"not readable as parquet: {exc}")
    missing = GL_REQUIRED - set(table.column_names)
    if missing:
        return FileReport(
            name=name, ok=False,
            error=f"parquet missing GL columns: {', '.join(sorted(missing))}",
        )
    try:
        rows = parse_gl_rows(table.to_pylist())
    except (KeyError, ValueError, TypeError) as exc:
        return FileReport(name=name, kind="gl", ok=False, error=str(exc))
    batch.gl.extend(rows)
    return FileReport(name=name, kind="gl", rows=len(rows), ok=True)


def _parse_invoices(name: str, data: bytes, batch: UploadBatch,
                    known_vendors: dict[str, str] | None) -> FileReport:
    try:
        text = data.decode("utf-8-sig")
        if name.lower().endswith(".json"):
            parsed = json.loads(text)
            if not isinstance(parsed, list) or not all(isinstance(r, dict) for r in parsed):
                return FileReport(
                    name=name, ok=False,
                    error="expected a JSON array of invoice records",
                )
            raws = parsed
        else:
            raws = [json.loads(line) for line in text.splitlines() if line.strip()]
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return FileReport(name=name, ok=False, error=f"not readable as JSON: {exc}")
    for i, r in enumerate(raws, 1):
        src = r.get("source")
        if src not in INVOICE_SOURCES:
            return FileReport(
                name=name, kind="invoices", ok=False,
                error=f"record {i}: unknown source {src!r}",
            )
    # seed the vendor name -> id map so email_ingest records can resolve vendors
    name_to_id = dict(known_vendors or {})
    try:
        for r in raws:
            if r["source"] == "vendor_portal":
                name_to_id[r["vendor"]["name"]] = r["vendor"]["id"]
            elif r["source"] == "edi_810":
                name_to_id[r["party"]["N1_VN"]] = r["party"]["vendor_code"]
    except (KeyError, TypeError) as exc:
        return FileReport(
            name=name, kind="invoices", ok=False, error=f"missing field {exc}"
        )
    rows: list[Invoice] = []
    for i, r in enumerate(raws, 1):
        try:
            rows.extend(parse_invoices([r], name_to_id=name_to_id))
        except (KeyError, ValueError, TypeError, AttributeError) as exc:
            return FileReport(
                name=name, kind="invoices", ok=False,
                error=f"record {i}: missing field {exc}",
            )
    batch.invoices.extend(rows)
    return FileReport(name=name, kind="invoices", rows=len(rows), ok=True)


def _parse_email(name: str, data: bytes, batch: UploadBatch) -> FileReport:
    try:
        em = parse_eml(name, data)
    except Exception as exc:
        return FileReport(name=name, kind="emails", ok=False, error=str(exc))
    batch.emails.append(em)
    return FileReport(name=name, kind="emails", rows=1, ok=True)


def _classify(name: str, data: bytes, batch: UploadBatch,
              known_vendors: dict[str, str] | None) -> FileReport:
    if _ignored(name):
        return FileReport(name=name, kind="ignored", ok=True)
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == ".zip":
        return FileReport(
            name=name, ok=False, error="nested zip archives are not supported"
        )
    if not data:
        if ext in (".csv", ".parquet", ".jsonl", ".json", ".eml"):
            return FileReport(name=name, ok=False, error="file is empty")
    if ext == ".csv":
        return _parse_csv(name, data, batch)
    if ext == ".parquet":
        return _parse_parquet(name, data, batch)
    if ext in (".jsonl", ".json"):
        return _parse_invoices(name, data, batch, known_vendors)
    if ext == ".eml":
        return _parse_email(name, data, batch)
    return FileReport(
        name=name, ok=False,
        error=f"unsupported file type '{ext or name}' — accepted: {ACCEPTED}",
    )


def _expand_zip(name: str, data: bytes) -> tuple[list[tuple[str, bytes]], str | None]:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return [], "not a valid zip archive"
    out = []
    for info in zf.infolist():
        if info.is_dir():
            continue
        out.append((f"{name}/{info.filename}", zf.read(info)))
    return out, None


def inspect_files(
    files: list[tuple[str, bytes]],
    *,
    known_vendors: dict[str, str] | None = None,
) -> tuple[UploadReport, UploadBatch]:
    if sum(len(d) for _, d in files) > MAX_BYTES:
        raise ValueError(f"upload exceeds {MAX_BYTES // (1024 * 1024)} MB")

    # Expand top-level zips into members before classifying.
    expanded: list[tuple[str, bytes]] = []
    reports: list[FileReport] = []
    for name, data in files:
        if name.lower().endswith(".zip") and not _ignored(name):
            members, err = _expand_zip(name, data)
            if err:
                reports.append(FileReport(name=name, ok=False, error=err))
            else:
                expanded.extend(members)
        else:
            expanded.append((name, data))

    batch = UploadBatch()
    for name, data in expanded:
        reports.append(_classify(name, data, batch, known_vendors))

    ok = all(r.ok for r in reports) and any(
        r.kind not in (None, "ignored") for r in reports
    )
    counts: dict[str, int] = {}
    for r in reports:
        if r.ok and r.kind not in (None, "ignored"):
            counts[r.kind] = counts.get(r.kind, 0) + r.rows
    return UploadReport(files=reports, ok=ok, counts=counts), batch
