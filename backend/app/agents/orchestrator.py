"""Orchestrator: picks which specialist agent(s) to run for a request.

Planning is LLM-driven when a provider is available (OpenAI via
build_llm); otherwise a deterministic keyword fallback is used. The
orchestrator never hardcodes agents — it plans from registry.specs().
"""

import json
import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.agents.base import AgentContext, AgentResult, AgentSpec
from app.agents.llm import LLMProvider
from app.agents.registry import AgentRegistry
from app.memory.models import Finding

SYSTEM_PROMPT = (
    "You are the CFO orchestrator for a finance close. Choose which specialist "
    "agents to run for the user's request. Respond ONLY with JSON: "
    '{"calls":[{"agent":<name>,"params":{...},"rationale":<short>}]}. '
    "Only use agents from the list. Use the params schema; omit params to "
    "accept defaults. Return an empty list if no agent applies."
)


class AgentCall(BaseModel):
    agent: str
    params: dict[str, Any] = {}
    rationale: str = ""


class Plan(BaseModel):
    request: str
    calls: list[AgentCall]
    planner: Literal["llm", "fallback"]
    raw: str | None = None


class OrchestrationResult(BaseModel):
    plan: Plan
    results: list[AgentResult]


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


class Orchestrator:
    name = "Orchestrator"

    def __init__(self, registry: AgentRegistry, llm: LLMProvider) -> None:
        self.registry = registry
        self.llm = llm

    def plan(self, request: str, defaults: dict | None = None) -> Plan:
        defaults = defaults or {}
        if self.llm.available:
            plan = self._llm_plan(request, defaults)
            if plan is not None:
                return plan
        return self._fallback_plan(request, defaults)

    def _llm_plan(self, request: str, defaults: dict) -> Plan | None:
        specs = {s.name: s for s in self.registry.specs()}
        spec_json = json.dumps([s.model_dump() for s in specs.values()], indent=2)
        user = (
            f"Request: {request}\n\n"
            f"Available agents:\n{spec_json}\n\n"
            f"Default params: {json.dumps(defaults)}"
        )
        try:
            raw = self.llm.complete(user, system=SYSTEM_PROMPT, json_mode=True)
        except Exception as exc:  # provider error -> deterministic fallback
            plan = self._fallback_plan(request, defaults)
            plan.raw = f"llm error: {type(exc).__name__}: {exc}"
            return plan
        try:
            data = json.loads(raw)
            raw_calls = data.get("calls") or []
            calls = []
            for c in raw_calls:
                name = c.get("agent")
                if name not in specs:
                    continue
                allowed = set(specs[name].params)
                params = {
                    **defaults,
                    **{
                        k: v
                        for k, v in (c.get("params") or {}).items()
                        if k in allowed
                    },
                }
                calls.append(AgentCall(agent=name, params=params, rationale=c.get("rationale", "")))
            if not calls:
                return None
            return Plan(request=request, calls=calls, planner="llm", raw=raw)
        except (json.JSONDecodeError, AttributeError, TypeError):
            return None

    def _fallback_plan(self, request: str, defaults: dict) -> Plan:
        specs = self.registry.specs()
        req_words = _words(request)

        def score(s: AgentSpec) -> int:
            text_words = _words(" ".join(s.capabilities) + " " + s.description)
            return len(req_words & text_words)

        chosen = [s for s in specs if score(s) > 0]
        # nothing scored: a single registered agent is the obvious pick;
        # with several, a bare request ("close the books") runs everything
        if not chosen:
            chosen = specs
        calls = [
            AgentCall(agent=s.name, params=dict(defaults), rationale="keyword fallback")
            for s in chosen
        ]
        return Plan(request=request, calls=calls, planner="fallback")

    def run(
        self, ctx: AgentContext, request: str, defaults: dict | None = None
    ) -> OrchestrationResult:
        plan = self.plan(request, defaults)
        results = [
            self.registry.get(call.agent).run(ctx, **call.params) for call in plan.calls
        ]
        ctx.memory.remember(
            Finding(
                agent=self.name,
                code="ORCHESTRATION_RUN",
                key=datetime.now().strftime("%Y%m%dT%H%M%S"),
                title=f"Ran {len(plan.calls)} agent(s) for: {request[:80]}",
                detail="; ".join(c.rationale for c in plan.calls if c.rationale),
                severity="info",
                entities=[c.agent for c in plan.calls],
                data=plan.model_dump(),
            )
        )
        return OrchestrationResult(plan=plan, results=results)
