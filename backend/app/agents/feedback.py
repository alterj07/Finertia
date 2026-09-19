"""FeedbackStore: the tuning seam.

A future chatbot translates "you were wrong about X" into Adjustment records;
agents apply them before running (see RuleBook.apply_adjustments).
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


class Adjustment(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    agent: str
    kind: Literal["rule_param", "pin_match", "block_match", "reclassify", "note"]
    payload: dict = {}
    reason: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now().replace(microsecond=0))


class FeedbackStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self.adjustments: list[Adjustment] = []
        if path and path.exists():
            self.adjustments = [Adjustment(**a) for a in json.loads(path.read_text())]

    def _save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([a.model_dump(mode="json") for a in self.adjustments], indent=2)
        )

    def add(self, adjustment: Adjustment) -> Adjustment:
        self.adjustments.append(adjustment)
        self._save()
        return adjustment

    def for_agent(self, name: str) -> list[Adjustment]:
        return [a for a in self.adjustments if a.agent == name]

    def remove(self, id: str) -> bool:
        before = len(self.adjustments)
        self.adjustments = [a for a in self.adjustments if a.id != id]
        changed = len(self.adjustments) != before
        if changed:
            self._save()
        return changed
