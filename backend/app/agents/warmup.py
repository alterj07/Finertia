"""Background agent warm-up: run the orchestrator once at startup when shared
memory holds no specialist findings, so dashboards and the chatbot have data
without a manual "Run agents" click."""

import logging
import threading
from collections.abc import Callable
from datetime import datetime
from typing import Literal

from app.agents.base import AgentContext
from app.agents.llm import LLMProvider
from app.agents.orchestrator import Orchestrator
from app.agents.registry import AgentRegistry
from app.memory.graph import MemoryGraph

log = logging.getLogger(__name__)

WarmupState = Literal["idle", "skipped", "running", "done", "failed"]


class AgentWarmup:
    """Runs the orchestrator once in the background when shared memory holds
    no specialist findings."""

    def __init__(
        self,
        ctx_factory: Callable[[], AgentContext],
        registry: AgentRegistry,
        llm: LLMProvider,
        request: str,
    ) -> None:
        self._ctx_factory = ctx_factory
        self._registry = registry
        self._llm = llm
        self._request = request
        self._lock = threading.Lock()
        self.state: WarmupState = "idle"
        self.started_at: datetime | None = None
        self.finished_at: datetime | None = None
        self.error: str | None = None
        self.agents: list[str] = []

    def needed(self, memory: MemoryGraph) -> bool:
        return not any(f.code != "ORCHESTRATION_RUN" for f in memory.findings)

    def run(self) -> None:
        with self._lock:
            if self.state == "running":
                return
            self.state = "running"
            self.started_at = datetime.now()
        try:
            ctx = self._ctx_factory()
            if not self.needed(ctx.memory):
                self.state = "skipped"
                return
            result = Orchestrator(self._registry, self._llm).run(ctx, self._request)
            self.agents = [r.agent for r in result.results]
            self.state = "done"
        except Exception as exc:
            log.exception("agent warm-up failed")
            self.state = "failed"
            self.error = f"{type(exc).__name__}: {exc}"
        finally:
            self.finished_at = datetime.now()

    def start(self) -> None:
        threading.Thread(target=self.run, name="agent-warmup", daemon=True).start()

    def status(self) -> dict:
        return {
            "state": self.state,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": (
                self.finished_at.isoformat() if self.finished_at else None
            ),
            "error": self.error,
            "agents": list(self.agents),
        }
