"""Orchestrator: picks which specialist agent(s) to run for a request.

Planning is LLM-driven when a provider is available (OpenAI via
build_llm); otherwise a deterministic keyword fallback is used. The
orchestrator never hardcodes agents — it plans from registry.specs().
"""

import json
import logging
import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.agents.base import AgentContext, AgentResult, AgentSpec
from app.agents.llm import LLMProvider
from app.agents.registry import AgentRegistry
from app.memory.models import Finding

log = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are the CFO orchestrator for a finance close. Choose which specialist "
    "agents to run for the user's request. Respond ONLY with JSON: "
    '{"calls":[{"agent":<name>,"params":{...},"rationale":<short>}]}. '
    "Only use agents from the list. Use the params schema; omit params to "
    "accept defaults. Return an empty list if no agent applies. "
    "Use the memory brief: prefer agents that have open signals "
    "(suggested_agent) or whose capabilities match the request; if a finding "
    "already covers the request for this period, still run the agent only when "
    "the user asks to run/re-run/refresh, otherwise return an empty list and "
    'explain in a top-level "reason" string.'
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
    reason: str = ""


class MemoryBrief(BaseModel):
    """What shared memory already knows, consulted before planning."""

    storage: Literal["elasticsearch", "json"]
    findings: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []
    search_hits: list[dict[str, Any]] = []
    signals_by_agent: dict[str, int] = {}


class OrchestrationResult(BaseModel):
    plan: Plan
    brief: MemoryBrief
    results: list[AgentResult]


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


class Orchestrator:
    name = "Orchestrator"

    def __init__(self, registry: AgentRegistry, llm: LLMProvider) -> None:
        self.registry = registry
        self.llm = llm

    def consult_memory(self, ctx: AgentContext, request: str) -> MemoryBrief:
        """Read the shared memory (ES-backed in elastic mode) before planning."""
        memory = ctx.memory
        brief = MemoryBrief(
            storage="elasticsearch" if memory.sync is not None else "json"
        )
        try:
            brief.findings = [
                {
                    "node_id": f"finding:{f.code}:{f.key}",
                    "agent": f.agent,
                    "code": f.code,
                    "key": f.key,
                    "title": f.title,
                    "amount": f.amount,
                }
                for f in memory.findings
                if f.code != "ORCHESTRATION_RUN"
            ][:40]
        except Exception as exc:
            log.warning("memory findings read failed: %s", exc)
        try:
            signals = memory.signals()[:25]
            brief.signals = [
                {
                    "code": s.code,
                    "key": s.key,
                    "title": s.title,
                    "suggested_agent": s.suggested_agent,
                    "amount": s.amount,
                    "period": s.period,
                }
                for s in signals
            ]
            for s in signals:
                brief.signals_by_agent[s.suggested_agent] = (
                    brief.signals_by_agent.get(s.suggested_agent, 0) + 1
                )
        except Exception as exc:
            log.warning("memory signals read failed: %s", exc)
        try:
            brief.search_hits = [
                {"id": n.id, "type": n.type, "score": s}
                for s, n in memory.search(request, k=8)
            ]
        except Exception as exc:
            log.warning("memory search failed: %s", exc)
        return brief

    def plan(
        self,
        request: str,
        defaults: dict | None = None,
        brief: MemoryBrief | None = None,
    ) -> Plan:
        defaults = defaults or {}
        if self.llm.available:
            plan = self._llm_plan(request, defaults, brief)
            if plan is not None:
                return plan
        return self._fallback_plan(request, defaults, brief)

    def _llm_plan(
        self, request: str, defaults: dict, brief: MemoryBrief | None = None
    ) -> Plan | None:
        specs = {s.name: s for s in self.registry.specs()}
        spec_json = json.dumps([s.model_dump() for s in specs.values()], indent=2)
        user = (
            f"Request: {request}\n\n"
            f"Available agents:\n{spec_json}\n\n"
            f"Default params: {json.dumps(defaults)}"
        )
        if brief is not None:
            user += (
                "\n\nMemory brief (consulted before planning):\n"
                + json.dumps(brief.model_dump(), default=str)
            )
        try:
            raw = self.llm.complete(user, system=SYSTEM_PROMPT, json_mode=True)
        except Exception as exc:  # provider error -> deterministic fallback
            plan = self._fallback_plan(request, defaults, brief)
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
                # an explicit empty plan with a reason is a real answer,
                # not a parse failure
                reason = data.get("reason")
                if reason:
                    return Plan(
                        request=request,
                        calls=[],
                        planner="llm",
                        raw=raw,
                        reason=str(reason),
                    )
                return None
            return Plan(request=request, calls=calls, planner="llm", raw=raw)
        except (json.JSONDecodeError, AttributeError, TypeError):
            return None

    def _fallback_plan(
        self, request: str, defaults: dict, brief: MemoryBrief | None = None
    ) -> Plan:
        specs = self.registry.specs()
        req_words = _words(request)
        signal_boost = brief.signals_by_agent if brief else {}

        def score(s: AgentSpec) -> int:
            text_words = _words(" ".join(s.capabilities) + " " + s.description)
            return len(req_words & text_words) + 2 * signal_boost.get(s.name, 0)

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
        brief = self.consult_memory(ctx, request)
        plan = self.plan(request, defaults, brief=brief)
        results = [
            self.registry.get(call.agent).run(ctx, **call.params) for call in plan.calls
        ]
        ctx.memory.remember(
            Finding(
                agent=self.name,
                code="ORCHESTRATION_RUN",
                key=datetime.now().strftime("%Y%m%dT%H%M%S"),
                title=f"Ran {len(plan.calls)} agent(s) for: {request[:80]}",
                detail=(
                    f"consulted {brief.storage} memory: "
                    f"{len(brief.findings)} findings, {len(brief.signals)} signals. "
                    + "; ".join(c.rationale for c in plan.calls if c.rationale)
                ).strip(),
                severity="info",
                entities=[c.agent for c in plan.calls],
                data={
                    "plan": plan.model_dump(),
                    "brief_summary": {
                        "storage": brief.storage,
                        "findings": len(brief.findings),
                        "signals": len(brief.signals),
                        "search_hits": len(brief.search_hits),
                        "signals_by_agent": brief.signals_by_agent,
                    },
                },
            )
        )
        return OrchestrationResult(plan=plan, brief=brief, results=results)
