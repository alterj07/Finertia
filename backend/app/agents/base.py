"""Agent framework seam — the contract a future orchestrator calls.

An Agent receives an AgentContext (data lake + shared memory graph + feedback
store + LLM provider) and returns an AgentResult with findings, a summary dict,
and a trace of the queries it made.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

from app.agents.feedback import FeedbackStore
from app.agents.llm import LLMProvider, NullLLM
from app.data.lake import DataLake
from app.memory.graph import MemoryGraph
from app.memory.models import Finding


@dataclass
class AgentContext:
    lake: DataLake
    memory: MemoryGraph
    feedback: FeedbackStore
    llm: LLMProvider = field(default_factory=NullLLM)


class AgentResult(BaseModel):
    agent: str
    findings: list[Finding]
    summary: dict[str, Any] = {}
    trace: list[dict[str, Any]] = []


class AgentSpec(BaseModel):
    name: str
    description: str = ""
    capabilities: list[str] = []
    params: dict[str, Any] = {}


class Agent(ABC):
    name: str = "agent"
    description: str = ""
    capabilities: list[str] = []
    params_schema: dict[str, Any] = {}

    @classmethod
    def spec(cls) -> AgentSpec:
        return AgentSpec(
            name=cls.name,
            description=cls.description,
            capabilities=cls.capabilities,
            params=cls.params_schema,
        )

    def __init__(self) -> None:
        self._trace: list[dict[str, Any]] = []

    def trace(self, why: str, **kw: Any) -> None:
        self._trace.append({"why": why, **kw})

    def finding(self, ctx: AgentContext, relations: Any = (), **kw: Any) -> Finding:
        return ctx.memory.remember(Finding(agent=self.name, **kw), relations=relations)

    @abstractmethod
    def run(self, ctx: AgentContext, **params: Any) -> AgentResult: ...
