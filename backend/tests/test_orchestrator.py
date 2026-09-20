import json
from pathlib import Path
from typing import Any

from app.agents.base import Agent, AgentContext, AgentResult
from app.agents.llm import NullLLM
from app.agents.orchestrator import Orchestrator
from app.agents.registry import AgentRegistry, default_registry


class FakeLLM:
    available = True

    def __init__(self, response: str) -> None:
        self.response = response
        self.prompts: list[str] = []
        self.systems: list[str | None] = []

    def complete(
        self, prompt: str, *, system: str | None = None, json_mode: bool = False, **kw: Any
    ) -> str:
        self.prompts.append(prompt)
        self.systems.append(system)
        return self.response


class DummyForecastAgent(Agent):
    name = "Forecasting"
    description = "13-week cash forecast"
    capabilities = ["forecast", "cash flow", "projection"]

    def run(self, ctx: AgentContext, **params: Any) -> AgentResult:
        return AgentResult(agent=self.name, summary={})


def canned(calls: list[dict]) -> FakeLLM:
    return FakeLLM(json.dumps({"calls": calls}))


def test_llm_plan_strips_bogus_params() -> None:
    llm = canned(
        [
            {
                "agent": "Cash & Reconciliation",
                "params": {"end": "2026-02-28", "bogus": 1},
                "rationale": "recon requested",
            }
        ]
    )
    plan = Orchestrator(default_registry(), llm).plan(
        "reconcile the bank", defaults={"start": "2026-01-01"}
    )
    assert plan.planner == "llm"
    assert len(plan.calls) == 1
    assert plan.calls[0].params == {"start": "2026-01-01", "end": "2026-02-28"}
    assert plan.raw is not None


def test_llm_plan_unknown_agent_falls_back() -> None:
    llm = canned([{"agent": "Nonexistent", "params": {}}])
    plan = Orchestrator(default_registry(), llm).plan("reconcile")
    assert plan.planner == "fallback"
    # no capability keyword matched, so the fallback runs every registered agent
    assert [c.agent for c in plan.calls] == ["Cash & Reconciliation", "AP/AR", "Deals"]


def test_llm_plan_garbage_falls_back() -> None:
    plan = Orchestrator(default_registry(), FakeLLM("not json at all")).plan("recon")
    assert plan.planner == "fallback"


def test_null_llm_falls_back() -> None:
    plan = Orchestrator(default_registry(), NullLLM()).plan("anything")
    assert plan.planner == "fallback"
    assert [c.agent for c in plan.calls] == ["Cash & Reconciliation", "AP/AR", "Deals"]
    plan = Orchestrator(default_registry(), NullLLM()).plan("bank reconciliation")
    assert [c.agent for c in plan.calls] == ["Cash & Reconciliation"]
    plan = Orchestrator(default_registry(), NullLLM()).plan("receivables aging")
    assert [c.agent for c in plan.calls] == ["AP/AR"]


def test_fallback_scoring_two_agents() -> None:
    reg = AgentRegistry()
    from app.agents.recon.agent import CashReconAgent

    reg.register(CashReconAgent)
    reg.register(DummyForecastAgent)
    orch = Orchestrator(reg, NullLLM())
    plan = orch.plan("please reconcile the bank")
    assert [c.agent for c in plan.calls] == ["Cash & Reconciliation"]
    plan = orch.plan("")
    assert {c.agent for c in plan.calls} == {"Cash & Reconciliation", "Forecasting"}


def test_orchestrator_run_end_to_end(ctx: AgentContext) -> None:
    result = Orchestrator(default_registry(), NullLLM()).run(ctx, "close the books for Q1")
    assert [r.agent for r in result.results] == ["Cash & Reconciliation", "AP/AR", "Deals"]
    assert result.results[0].summary["difference"] == 0
    assert result.results[1].summary["open_ar_total"] > 0
    runs = ctx.memory.recall(code="ORCHESTRATION_RUN")
    assert len(runs) == 1
    assert runs[0].entities == ["Cash & Reconciliation", "AP/AR", "Deals"]


def test_api(client, data_dir: Path) -> None:
    specs = client.get("/api/agents").json()
    assert [s["name"] for s in specs] == ["Cash & Reconciliation", "AP/AR", "Deals"]
    r = client.post("/api/orchestrator/run", json={"request": "bank reconciliation Q1"})
    assert r.status_code == 200
    body = r.json()
    assert body["plan"]["planner"] in ("llm", "fallback")
    agents = [r["agent"] for r in body["results"]]
    assert "Cash & Reconciliation" in agents
    assert "brief" in body


def test_registry_surface() -> None:
    assert default_registry().names() == ["Cash & Reconciliation", "AP/AR"]


def _brief(**kw: Any):
    from app.agents.orchestrator import MemoryBrief

    return MemoryBrief(storage="json", **kw)


def test_llm_prompt_includes_brief() -> None:
    llm = canned([{"agent": "AP/AR", "params": {}, "rationale": "apar signals"}])
    brief = _brief(signals=[{"code": "DUP_INVOICE"}], signals_by_agent={"AP/AR": 1})
    plan = Orchestrator(default_registry(), llm).plan("payables issues", brief=brief)
    assert plan.planner == "llm"
    assert "Memory brief" in llm.prompts[0]
    assert "DUP_INVOICE" in llm.prompts[0]
    assert "memory brief" in llm.systems[0]


def test_llm_explicit_empty_plan(ctx: AgentContext) -> None:
    llm = FakeLLM(json.dumps({"calls": [], "reason": "already covered"}))
    orch = Orchestrator(default_registry(), llm)
    plan = orch.plan("what changed?", brief=_brief())
    assert plan.planner == "llm"
    assert plan.calls == []
    assert plan.reason == "already covered"
    result = orch.run(ctx, "what changed?")
    assert result.results == []
    assert ctx.memory.recall(code="ORCHESTRATION_RUN")


def test_fallback_scores_signals() -> None:
    orch = Orchestrator(default_registry(), NullLLM())
    brief = _brief(signals_by_agent={"AP/AR": 3})
    plan = orch.plan("", brief=brief)
    assert [c.agent for c in plan.calls] == ["AP/AR"]
    plan = orch.plan("reconcile the bank", brief=brief)
    assert {c.agent for c in plan.calls} == {"Cash & Reconciliation", "AP/AR"}
    plan = orch.plan("", brief=_brief())
    assert {c.agent for c in plan.calls} == {"Cash & Reconciliation", "AP/AR"}


def test_consult_memory(ctx: AgentContext) -> None:
    ctx.memory.seed(ctx.lake)
    brief = Orchestrator(default_registry(), NullLLM()).consult_memory(
        ctx, "helios remit"
    )
    assert brief.storage == "json"
    assert len(brief.signals) > 0
    assert set(brief.signals_by_agent) & {"AP/AR", "Cash & Reconciliation"}
    assert brief.search_hits

    from app.agents.recon.agent import CashReconAgent

    CashReconAgent().run(ctx)
    brief = Orchestrator(default_registry(), NullLLM()).consult_memory(ctx, "recon")
    assert any(f["code"] == "RECON_SUMMARY" for f in brief.findings)


def test_run_records_brief_summary(ctx: AgentContext) -> None:
    ctx.memory.seed(ctx.lake)
    result = Orchestrator(default_registry(), NullLLM()).run(
        ctx, "find duplicate invoices and payables issues"
    )
    assert "AP/AR" in [c.agent for c in result.plan.calls]
    assert "AP/AR" in [r.agent for r in result.results]
    run = ctx.memory.recall(code="ORCHESTRATION_RUN")[-1]
    assert run.data["brief_summary"]["storage"] == "json"


def test_api_brief(client) -> None:
    r = client.get("/api/orchestrator/brief", params={"request": "reconcile"})
    assert r.status_code == 200
    body = r.json()
    assert body["storage"] == "json"
    assert "signals" in body
