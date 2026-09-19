from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "high", "medium", "low", "info"]


class Finding(BaseModel):
    agent: str
    code: str
    key: str
    title: str
    detail: str = ""
    severity: Severity = "medium"
    amount: float | None = None
    entities: list[str] = []
    evidence: list[str] = []
    proposed_je: dict[str, Any] | None = None
    data: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now().replace(microsecond=0))


class Node(BaseModel):
    id: str
    type: str
    props: dict[str, Any] = {}


class Edge(BaseModel):
    src: str
    rel: str
    dst: str
    agent: str = ""
    created_at: str = ""
    finding_node: str | None = None  # set on edges written by remember() for idempotent re-runs
    props: dict[str, Any] = {}  # e.g. amount_diff on RECORDS / SETTLES / CLEARS


class Signal(BaseModel):
    """A structural anomaly the graph can surface on its own, for an agent to confirm.

    Signals are leads, not findings: an agent (or a human) turns one into a Finding
    via MemoryGraph.remember once it has looked at the evidence.
    """

    code: str
    key: str
    title: str
    suggested_agent: str
    amount: float | None = None
    period: str | None = None
    entities: list[str] = []
    evidence: list[str] = []
    detail: str = ""
