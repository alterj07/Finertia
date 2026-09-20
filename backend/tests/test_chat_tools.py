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
    assert len(out["results"]) >= 1
    assert all("id" in r for r in out["results"])
    assert out["citations"] == [r["id"] for r in out["results"]]


def test_get_context(tools) -> None:
    hit = tools["search_memory"].fn("helios")["results"][0]["id"]
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
