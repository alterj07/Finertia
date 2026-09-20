import pytest

from app.agents.base import AgentContext
from app.agents.llm import NullLLM
from app.agents.orchestrator import Orchestrator
from app.agents.registry import default_registry
from app.chat.tools import build_tools


@pytest.fixture()
def tools(ctx: AgentContext):
    ctx.memory.seed(ctx.lake)
    registry = default_registry()
    return {t.name: t for t in build_tools(ctx, registry, Orchestrator(registry, NullLLM()))}


def test_search_memory(tools) -> None:
    out = tools["search_memory"].fn("helios")
    assert len(out["nodes"]) >= 1
    assert all("id" in r for r in out["nodes"])
    assert out["citations"][: len(out["nodes"])] == [r["id"] for r in out["nodes"]]


def test_search_memory_includes_labels(tools) -> None:
    out = tools["search_memory"].fn("harbor")
    assert all("label" in n for n in out["nodes"])
    vendor = next(n for n in out["nodes"] if n["type"] == "vendor")
    assert vendor["label"] == "Harbor Insurance Co"


def test_labels_for(tools, ctx: AgentContext) -> None:
    from app.chat.tools import labels_for
    from app.memory.models import Finding

    ctx.memory.remember(
        Finding(
            agent="AP/AR",
            code="DUPLICATE",
            key="INV-1",
            title="Duplicate invoice INV-1",
            detail="same invoice twice",
        )
    )
    labels = labels_for(ctx.memory, ["V012", "finding:DUPLICATE:INV-1", "NOPE-9"])
    assert labels["V012"] == "Harbor Insurance Co"
    assert labels["finding:DUPLICATE:INV-1"] == "Duplicate invoice INV-1"
    assert "NOPE-9" not in labels


def test_search_memory_finds_finding_by_number_word(tools, ctx) -> None:
    default_registry().get("Cash & Reconciliation").run(ctx)
    out = tools["search_memory"].fn("bank credit matched three invoices")
    codes = [f["code"] for f in out["findings"]]
    assert "LUMP_SUM_MATCH" in codes


def test_search_memory_link_counts(tools) -> None:
    out = tools["search_memory"].fn("BK00044", k=10)
    node = next(n for n in out["nodes"] if n["id"] == "BK00044")
    assert node["links"]["SETTLES"] == 3


def test_get_context(tools) -> None:
    hit = tools["search_memory"].fn("helios")["nodes"][0]["id"]
    out = tools["get_context"].fn(hit)
    assert out["text"]
    assert hit in out["node_ids"]
    assert out["citations"]


def test_record_feedback(tools, ctx: AgentContext) -> None:
    out = tools["record_feedback"].fn(
        agent="Cash & Reconciliation",
        kind="block_match",
        payload={"pairs": [["BK00001", "JE-1007"]]},
        reason="test",
    )
    assert "adjustment" in out
    adjs = ctx.feedback.for_agent("Cash & Reconciliation")
    assert any(a.kind == "block_match" for a in adjs)
    bad = tools["record_feedback"].fn(
        agent="Nobody", kind="note", payload={}, reason="x"
    )
    assert "error" in bad


def test_run_orchestrator(tools) -> None:
    out = tools["run_orchestrator"].fn("reconcile Q1")
    recon = next(r for r in out["results"] if r["agent"] == "Cash & Reconciliation")
    assert recon["findings_count"] > 0
    assert recon["headline"]
    assert out["citations"]


def test_run_orchestrator_compact_digest(tools, ctx) -> None:
    import json

    reg = default_registry()
    reg.get("Cash & Reconciliation").run(ctx)
    reg.get("AP/AR").run(ctx)
    out = tools["run_orchestrator"].fn("close the books")
    assert "summary" not in json.dumps(out)
    assert out["ran"]
    for r in out["results"]:
        assert len(r["top"]) <= 3
        assert "headline" in r
        assert "findings_count" in r
    assert out["blockers"]
    assert len(json.dumps(out, default=str)) < 6000


def test_get_findings_detail_truncated(tools, ctx) -> None:
    default_registry().get("Cash & Reconciliation").run(ctx)
    out = tools["get_findings"].fn()
    assert len(out["findings"]) <= 25
    assert all(len(f["detail"]) <= 160 for f in out["findings"])


def test_get_findings_exposes_data(tools, ctx) -> None:
    import json

    reg = default_registry()
    reg.get("Cash & Reconciliation").run(ctx)
    reg.get("AP/AR").run(ctx)
    pr = tools["get_findings"].fn(code="PAYMENT_RUN")["findings"][0]
    assert "INV-7781" in json.dumps(pr["data"]["on_hold"])
    assert len(json.dumps(tools["get_findings"].fn(), default=str)) < 20000
