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
    assert out["results"][0]["summary"]["difference"] == 0
    assert "matches" not in out["results"][0]["summary"]
    assert out["citations"]
