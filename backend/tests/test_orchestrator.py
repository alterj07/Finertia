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

    def complete(
        self, prompt: str, *, system: str | None = None, json_mode: bool = False, **kw: Any
    ) -> str:
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
    assert [c.agent for c in plan.calls] == ["Cash & Reconciliation", "AP/AR"]


def test_llm_plan_garbage_falls_back() -> None:
    plan = Orchestrator(default_registry(), FakeLLM("not json at all")).plan("recon")
    assert plan.planner == "fallback"


def test_null_llm_falls_back() -> None:
    plan = Orchestrator(default_registry(), NullLLM()).plan("anything")
    assert plan.planner == "fallback"
    assert [c.agent for c in plan.calls] == ["Cash & Reconciliation", "AP/AR"]
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
    assert [r.agent for r in result.results] == ["Cash & Reconciliation", "AP/AR"]
    assert result.results[0].summary["difference"] == 0
    assert result.results[1].summary["open_ar_total"] > 0
    runs = ctx.memory.recall(code="ORCHESTRATION_RUN")
    assert len(runs) == 1
    assert runs[0].entities == ["Cash & Reconciliation", "AP/AR"]


def test_api(client, data_dir: Path) -> None:
    specs = client.get("/api/agents").json()
    assert [s["name"] for s in specs] == ["Cash & Reconciliation", "AP/AR"]
    r = client.post("/api/orchestrator/run", json={"request": "bank reconciliation Q1"})
    assert r.status_code == 200
    body = r.json()
    assert body["plan"]["planner"] in ("llm", "fallback")
    assert len(body["results"]) == 1
