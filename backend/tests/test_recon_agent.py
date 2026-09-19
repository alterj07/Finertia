from pathlib import Path

import pytest

from app.agents.base import AgentContext
from app.agents.feedback import Adjustment
from app.agents.recon.agent import CashReconAgent
from app.memory.graph import MemoryGraph

EXPECTED_CODES = {
    "LUMP_SUM_MATCH",
    "UNRECORDED_BANK_ITEMS",
    "TIMING_ITEMS",
    "FX_DIFFERENCE",
    "RECON_SUMMARY",
    "AMOUNT_VARIANCE",
}


def _run(ctx: AgentContext):
    return CashReconAgent().run(ctx, start="2026-01-01", end="2026-03-31")


def test_recon_matches_ground_truth(ctx: AgentContext) -> None:
    result = _run(ctx)
    findings = {(f.code, f.key): f for f in result.findings}

    lump = next(f for f in result.findings if f.code == "LUMP_SUM_MATCH")
    assert lump.key == "88213"
    assert lump.amount == pytest.approx(58339.68)

    unrec = findings[("UNRECORDED_BANK_ITEMS", "2026-03")]
    assert unrec.amount == pytest.approx(267.18)
    assert unrec.proposed_je is not None

    timing = next(f for f in result.findings if f.code == "TIMING_ITEMS")
    assert "CHECK 1026" in timing.key

    fx = findings[("FX_DIFFERENCE", "BP-4471")]
    assert fx.amount == pytest.approx(72.0)

    s = result.summary
    assert s["adjusted_bank"] == pytest.approx(428321.64, abs=0.01)
    assert s["difference"] == pytest.approx(0.0)

    assert {f.code for f in result.findings} <= EXPECTED_CODES


def test_findings_persisted_to_memory(ctx: AgentContext) -> None:
    _run(ctx)
    recalled = ctx.memory.recall(code="RECON_SUMMARY")
    assert len(recalled) == 1
    assert recalled[0].data["adjusted_bank"] == pytest.approx(428321.64, abs=0.01)
    # graph edges exist for at least one finding node
    fx_edges = ctx.memory.neighbors("finding:FX_DIFFERENCE:BP-4471", depth=1)
    assert fx_edges


def test_rerun_is_idempotent(ctx: AgentContext) -> None:
    _run(ctx)
    n = len(ctx.memory.findings)
    n_edges = len(ctx.memory.edges)
    _run(ctx)
    assert len(ctx.memory.findings) == n
    assert len(ctx.memory.edges) == n_edges


def test_api_run_twice_idempotent(client, data_dir: Path) -> None:
    body = {"start": "2026-01-01", "end": "2026-03-31"}
    r1 = client.post("/api/agents/recon/run", json=body)
    assert r1.status_code == 200
    r2 = client.post("/api/agents/recon/run", json=body)
    assert r2.status_code == 200
    assert len(r2.json()["findings"]) == len(r1.json()["findings"])
    graph = client.get("/api/memory/graph").json()
    assert len(graph["findings"]) == len(r1.json()["findings"])


def test_block_match_adjustment(ctx: AgentContext) -> None:
    # discover the bank txn + JE the tolerance rule pairs on BP-4471
    result = _run(ctx)
    fx = next(f for f in result.findings if f.code == "FX_DIFFERENCE")
    bank_id, je_id = fx.evidence
    ctx.feedback.add(
        Adjustment(
            agent="Cash & Reconciliation",
            kind="block_match",
            payload={"pairs": [[bank_id, je_id]]},
            reason="do not match this pair",
        )
    )
    ctx2 = AgentContext(
        lake=ctx.lake,
        memory=MemoryGraph(ctx.memory.path.parent / "g2.json"),
        feedback=ctx.feedback,
    )
    result2 = _run(ctx2)
    assert not [f for f in result2.findings if f.code == "FX_DIFFERENCE"]
    assert je_id in result2.summary["unexplained_book"]
    assert bank_id in result2.summary["unexplained_bank"]
