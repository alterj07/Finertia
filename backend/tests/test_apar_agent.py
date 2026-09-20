"""AP/AR agent must reproduce the planted AP/AR traps and the AR aging exactly."""

import json
from pathlib import Path

import pytest

from app.agents.apar.agent import APARAgent
from app.agents.base import AgentContext
from app.memory.ocr import parse_invoice_fields

APAR_TRAPS = {
    "DUPLICATE_PAYMENT",
    "AMOUNT_MISMATCH",
    "SHORT_PAY_DISPUTE",
    "UNRECORDED_LIABILITY",
    "VENDOR_BANK_CHANGE",
    "PROMISE_TO_PAY",
}


@pytest.fixture()
def seeded(ctx: AgentContext) -> AgentContext:
    ctx.memory.seed(ctx.lake)
    return ctx


def _run(ctx: AgentContext):
    return APARAgent().run(ctx, start="2026-01-01", end="2026-03-31")


def test_ocr_fields_parse(data_dir: Path) -> None:
    ocr = json.loads((data_dir / "scanned_invoices" / "ocr.json").read_text())
    f = parse_invoice_fields(ocr["scan_keystone_KL-2026-031.png"]["text"])
    assert f["number"] == "KL-2026-031" and f["total"] == 4850.0 and f["currency"] == "USD"
    assert f["invoice_date"] == "2026-03-09" and f["due_date"] == "2026-04-08"
    assert f["remit_account"] == "6614" and f["lines_sum"] == 4850.0
    f = parse_invoice_fields(ocr["scan_cloudnimbus_CN-2026-03.png"]["text"])
    assert f["remit_account"] == "9921" and f["total"] == 16880.0
    f = parse_invoice_fields(ocr["scan_bauer_BP-4471.png"]["text"])
    assert f["currency"] == "EUR" and f["total"] == 8000.0 and f["remit_account"] == "3000"


def test_scans_linked_with_ocr(seeded: AgentContext) -> None:
    g = seeded.memory
    scan = g.nodes["scan_keystone_KL-2026-031.png"]
    assert scan.props["ocr_total"] == 4850.0
    assert g.nodes["KL-2026-031"].props["scan_total"] == 4850.0
    e = g.edge("scan_keystone_KL-2026-031.png", "SCAN_OF", "KL-2026-031")
    assert e and e.props["total_diff"] == 0.0 and e.props["remit_match"] is True
    # search reaches OCR text
    assert g.search("regulatory review", types=["scan"])[0][1].id == "scan_keystone_KL-2026-031.png"


def test_apar_matches_ground_truth(seeded: AgentContext, data_dir: Path) -> None:
    truth = json.loads((data_dir / "ground_truth.json").read_text())
    result = _run(seeded)
    by_code: dict[str, list] = {}
    for f in result.findings:
        by_code.setdefault(f.code, []).append(f)

    for trap in truth["traps"]:
        if trap["code"] not in APAR_TRAPS:
            continue
        hits = [
            f
            for f in by_code.get(trap["code"], [])
            if trap["key"].replace("-", "") in (f.key + " ".join(f.entities)).replace("-", "")
        ]
        assert hits, (trap["id"], trap["code"], trap["key"])
        if trap["amount"] is not None:
            assert any(f.amount == pytest.approx(trap["amount"], abs=0.01) for f in hits), trap[
                "id"
            ]

    dup = by_code["DUPLICATE_PAYMENT"][0]
    assert {"BK00037", "BK00041", "001_brightline_resend.eml"} <= set(dup.evidence)
    assert dup.proposed_je["lines"][0][1] == pytest.approx(12400.0)

    mismatch = by_code["AMOUNT_MISMATCH"][0]
    assert "scan_keystone_KL-2026-031.png" in mismatch.evidence
    assert "confirmed by scan and email" in mismatch.detail
    assert mismatch.proposed_je["lines"][0] == ("2000", 630.0, 0.0)

    accrual = by_code["UNRECORDED_LIABILITY"][0]
    assert accrual.proposed_je["lines"] == [("6300", 9750.0, 0.0), ("2100", 0.0, 9750.0)]
    assert "009_summit_phase2.eml" in accrual.evidence and "SCG-1102" in accrual.evidence

    bank = by_code["VENDOR_BANK_CHANGE"][0]
    assert bank.severity == "critical" and "BK00051" in bank.evidence
    assert "003_cloudnimbus_bank_change.eml" in bank.evidence

    promise = by_code["PROMISE_TO_PAY"][0]
    assert promise.data["promised_date"] == "2026-04-15"

    # ---- AR aging ties to the answer key
    s = result.summary
    assert s["open_ar_total"] == pytest.approx(truth["open_ar_total"], abs=0.01)
    rows = {r["invoice"]: r for r in s["open_ar"]}
    assert set(rows) == {t["invoice"] for t in truth["open_ar"]}
    for t in truth["open_ar"]:
        assert rows[t["invoice"]]["open"] == pytest.approx(t["open"], abs=0.01)
        assert rows[t["invoice"]]["days_past_due"] == t["days_past_due"]
        assert rows[t["invoice"]]["customer_id"] == t["customer_id"]
    assert rows["AR-1044"]["status"] == "disputed"
    assert rows["AR-1049"]["status"] == "promised"

    # ---- payment run excludes held invoices
    held = set(s["on_hold"])
    assert {"INV-7781", "KL-2026-031", "SCG-1187", "CN-2026-03"} <= held
    assert all(r["invoice"] not in held for r in s["payment_run"])


def test_apar_rerun_is_idempotent(seeded: AgentContext) -> None:
    r1 = _run(seeded)
    n_edges = len(seeded.memory.edges)
    r2 = _run(seeded)
    assert len(r2.findings) == len(r1.findings)
    assert len(seeded.memory.edges) == n_edges


def test_apar_api_and_orchestrator(client) -> None:
    r = client.post("/api/agents/apar/run", json={"end": "2026-03-31"})
    assert r.status_code == 200
    codes = {f["code"] for f in r.json()["findings"]}
    assert APAR_TRAPS <= codes
    plan = client.post(
        "/api/orchestrator/run", json={"request": "work the receivables aging and pay vendors"}
    )
    assert plan.status_code == 200
    assert "AP/AR" in [c["agent"] for c in plan.json()["plan"]["calls"]]
    assert client.get("/api/memory/findings", params={"agent": "AP/AR"}).json()
