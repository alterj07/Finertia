"""Uploads: /api/uploads/validate inspects files, /api/uploads commits to the
lake and re-seeds the memory graph."""

import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.data.es_lake import ElasticDataLake
from app.data.models import BankTxn
from app.data.upload import UploadBatch

BANK_CSV = (
    "txn_id,posted_date,amount,running_balance,txn_type,description,check_number\n"
    "BK99999,2026-02-10,-100.00,5000.00,WIRE_OUT,Payment to Acme INV-9999,\n"
)


def _files(*parts: tuple[str, bytes]) -> list[tuple[str, tuple[str, bytes]]]:
    return [("files", (name, data)) for name, data in parts]


def _validate(client: TestClient, *parts: tuple[str, bytes]):
    return client.post("/api/uploads/validate", files=_files(*parts))


def test_validate_real_files(client: TestClient, data_dir: Path) -> None:
    eml = sorted((data_dir / "emails").glob("*.eml"))[0]
    r = _validate(
        client,
        ("bank_transactions.csv", (data_dir / "bank_transactions.csv").read_bytes()),
        ("vendor_invoices.jsonl", (data_dir / "vendor_invoices.jsonl").read_bytes()),
        (f"emails/{eml.name}", eml.read_bytes()),
    )
    assert r.status_code == 200
    report = r.json()
    assert report["ok"] is True
    kinds = {f["name"]: (f["kind"], f["rows"]) for f in report["files"]}
    assert kinds["bank_transactions.csv"] == ("bank", 55)
    assert kinds["vendor_invoices.jsonl"] == ("invoices", 34)
    assert kinds[f"emails/{eml.name}"] == ("emails", 1)
    assert report["counts"] == {"bank": 55, "invoices": 34, "emails": 1}


def test_validate_incompatible_and_ignored(client: TestClient) -> None:
    r = _validate(
        client,
        ("notes.txt", b"hello"),
        ("ocr.json", json.dumps({"pages": []}).encode()),
        (".DS_Store", b"junk"),
        ("bank_transactions.csv", BANK_CSV.encode()),
    )
    report = r.json()
    assert report["ok"] is False
    by_name = {f["name"]: f for f in report["files"]}
    assert by_name["notes.txt"]["kind"] is None
    assert "unsupported file type" in by_name["notes.txt"]["error"]
    assert by_name["ocr.json"]["kind"] is None
    assert "JSON array" in by_name["ocr.json"]["error"]
    assert by_name[".DS_Store"]["kind"] == "ignored"
    assert by_name[".DS_Store"]["ok"] is True
    assert by_name["bank_transactions.csv"]["kind"] == "bank"


def test_validate_zip(client: TestClient, data_dir: Path) -> None:
    eml = sorted((data_dir / "emails").glob("*.eml"))[0]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("bank_transactions.csv", BANK_CSV)
        zf.writestr("emails/x.eml", eml.read_bytes())
        zf.writestr("__MACOSX/._x", b"junk")
    r = _validate(client, ("drop.zip", buf.getvalue()))
    report = r.json()
    assert report["ok"] is True
    by_name = {f["name"]: f for f in report["files"]}
    assert by_name["drop.zip/bank_transactions.csv"]["kind"] == "bank"
    assert by_name["drop.zip/emails/x.eml"]["kind"] == "emails"
    assert by_name["drop.zip/__MACOSX/._x"]["kind"] == "ignored"


def test_validate_csv_missing_bank_columns(client: TestClient) -> None:
    r = _validate(client, ("bank.csv", b"txn_id,amount\nBK1,5.00\n"))
    f = r.json()["files"][0]
    assert f["kind"] is None
    assert "posted_date" in f["error"]


def test_validate_gl_csv(client: TestClient) -> None:
    csv = (
        "je_id,line_no,posting_date,account,debit,credit,memo\n"
        "JE-1,1,2026-02-10,1000,10.00,0,test\n"
    )
    r = _validate(client, ("gl.csv", csv.encode()))
    f = r.json()["files"][0]
    assert f["kind"] == "gl"
    assert f["rows"] == 1


def test_upload_commits_and_reseeds(client: TestClient) -> None:
    memory = client.app.state.memory
    findings_before = len(memory.findings)
    bank_before = len(client.app.state.lake.bank)

    r = client.post("/api/uploads", files=_files(("new_bank.csv", BANK_CSV.encode())))
    assert r.status_code == 200
    body = r.json()
    assert body["added"] == {"bank": 1}
    assert body["backend"] == "local"

    lake = client.app.state.lake
    assert len(lake.bank) == bank_before + 1
    txn = next(b for b in lake.bank if b.txn_id == "BK99999")
    assert str(txn.posted_date) == "2026-02-10"
    nid = memory.resolve("BK99999")
    assert nid in memory.nodes
    assert memory.nodes[nid].type == "bank_txn"
    assert len(memory.findings) == findings_before

    # re-uploading the same file dedupes on txn_id
    r = client.post("/api/uploads", files=_files(("new_bank.csv", BANK_CSV.encode())))
    assert r.status_code == 200
    assert len(lake.bank) == bank_before + 1


def test_upload_incompatible_blocked(client: TestClient) -> None:
    lake = client.app.state.lake
    bank_before = len(lake.bank)
    r = client.post(
        "/api/uploads",
        files=_files(
            ("new_bank.csv", BANK_CSV.encode()),
            ("notes.txt", b"not data"),
        ),
    )
    assert r.status_code == 400
    body = r.json()
    assert "report" in body
    assert "notes.txt" in body["detail"]
    assert len(lake.bank) == bank_before


class RecordingStore:
    def __init__(self) -> None:
        self.created: list[tuple[str, dict, bool]] = []
        self.bulked: list[tuple[str, list[dict], str | None]] = []

    def exists(self, name: str) -> bool:
        return True

    def create_index(self, name, mappings, recreate=False):
        self.created.append((name, mappings, recreate))

    def count(self, name: str) -> int:
        return 55 if name == "fin-bank" else 0

    def bulk(self, name, docs, id_field=None):
        self.bulked.append((name, docs, id_field))


def test_elastic_lake_add_upserts() -> None:
    store = RecordingStore()
    lake = ElasticDataLake(store)  # type: ignore[arg-type]
    lake.__dict__["bank"] = []  # pretend the cached view was populated

    batch = UploadBatch(
        bank=[
            BankTxn(
                txn_id="BK99999",
                posted_date="2026-02-10",
                amount=-100.0,
                running_balance=5000.0,
                txn_type="WIRE_OUT",
                description="Payment",
            )
        ]
    )
    counts = lake.add(batch)

    assert counts == {"bank": 1}
    assert store.created == [("fin-bank", store.created[0][1], False)]
    name, docs, id_field = store.bulked[0]
    assert name == "fin-bank"
    assert id_field == "txn_id"
    assert [d["ord"] for d in docs] == [55]
    assert docs[0]["txn_id"] == "BK99999"
    assert "bank" not in lake.__dict__
