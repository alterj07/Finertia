import time

import pytest
from fastapi.testclient import TestClient

from app.agents.base import AgentContext
from app.agents.llm import NullLLM
from app.agents.registry import default_registry
from app.agents.warmup import AgentWarmup
from app.config import settings
from app.main import create_app
from app.memory.models import Finding


def _warmup(ctx: AgentContext, request: str = "close the books") -> AgentWarmup:
    return AgentWarmup(lambda: ctx, default_registry(), NullLLM(), request)


def test_needed_empty_vs_seeded(ctx: AgentContext) -> None:
    w = _warmup(ctx)
    ctx.memory.seed(ctx.lake)
    assert w.needed(ctx.memory)
    ctx.memory.remember(
        Finding(
            agent="Orchestrator",
            code="ORCHESTRATION_RUN",
            key="k",
            title="t",
            severity="info",
        )
    )
    assert w.needed(ctx.memory)
    ctx.memory.remember(
        Finding(agent="x", code="RECON_SUMMARY", key="k", title="t", severity="info")
    )
    assert not w.needed(ctx.memory)


def test_run_executes_agents(ctx: AgentContext) -> None:
    ctx.memory.seed(ctx.lake)
    w = _warmup(ctx)
    w.run()
    assert w.state == "done"
    assert w.agents
    assert any(f.code != "ORCHESTRATION_RUN" for f in ctx.memory.findings)


def test_run_skips_when_findings_exist(ctx: AgentContext) -> None:
    ctx.memory.seed(ctx.lake)
    ctx.memory.remember(
        Finding(agent="x", code="RECON_SUMMARY", key="k", title="t", severity="info")
    )
    count = len(ctx.memory.findings)
    w = _warmup(ctx)
    w.run()
    assert w.state == "skipped"
    assert len(ctx.memory.findings) == count


def test_run_failure_is_captured(ctx: AgentContext) -> None:
    def bad_factory() -> AgentContext:
        raise RuntimeError("no ctx")

    w = AgentWarmup(bad_factory, default_registry(), NullLLM(), "x")
    w.run()
    assert w.state == "failed"
    assert w.error and "no ctx" in w.error


def test_status_endpoint_idle(client: TestClient) -> None:
    out = client.get("/api/orchestrator/status")
    assert out.status_code == 200
    assert out.json()["state"] == "idle"


@pytest.mark.timeout(90)
def test_auto_run_fills_dashboards(tmp_path, monkeypatch, data_dir) -> None:
    monkeypatch.setattr(settings, "memory_graph_path", tmp_path / "memory_graph.json")
    monkeypatch.setattr(settings, "feedback_path", tmp_path / "feedback.json")
    monkeypatch.setattr(settings, "chat_sessions_path", tmp_path / "chat_sessions.json")
    monkeypatch.setattr(settings, "users_path", tmp_path / "users.json")
    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "openai_api_key", None)
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "auto_run_agents", True)
    with TestClient(create_app()) as c:
        token = c.post(
            "/api/auth/login", json={"identifier": "admin", "password": "password"}
        ).json()["token"]
        c.headers["Authorization"] = f"Bearer {token}"
        deadline = time.time() + 60
        status = {}
        while time.time() < deadline:
            status = c.get("/api/orchestrator/status").json()
            if status["state"] in ("done", "failed"):
                break
            time.sleep(0.2)
        assert status["state"] == "done", status
        assert status["agents"]
        dash = c.get("/api/dashboard/command-center")
        assert dash.status_code == 200
        assert dash.json()["needs_run"] is False
