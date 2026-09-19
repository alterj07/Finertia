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
