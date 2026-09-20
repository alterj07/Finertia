from pathlib import Path

from app.agents.audit.agent import AuditAgent
from app.agents.base import AgentContext

EXPECTED_CODES = {"SOD_VIOLATION", "AUDIT_SUMMARY", "CASH_FORECAST"}


def _run(ctx: AgentContext):
    return AuditAgent().run(ctx, start="2026-01-01", end="2026-03-31")


def test_audit_agent_seeds_memory_when_missing(ctx: AgentContext) -> None:
    assert not ctx.memory.nodes
    _run(ctx)
    assert ctx.memory.nodes  # seeded from the lake


def test_audit_covers_controls_reporting_and_forecast(ctx: AgentContext) -> None:
    result = _run(ctx)
    codes = {f.code for f in result.findings}
    assert codes <= EXPECTED_CODES
    # the seeded dataset plants a self-approved/off-hours journal (one of the
    # ground-truth traps) — the whole point of this agent is to catch it
    assert "SOD_VIOLATION" in codes
    assert "AUDIT_SUMMARY" in codes
    assert "CASH_FORECAST" in codes


def test_reporting_summary_counts_open_findings(ctx: AgentContext) -> None:
    result = _run(ctx)
    summary = next(f for f in result.findings if f.code == "AUDIT_SUMMARY")
    # the rollup is computed before AUDIT_SUMMARY and CASH_FORECAST themselves
    # are written, so it counts everything else this run produced
    assert summary.data["total_findings"] == len(result.findings) - 2
    assert sum(summary.data["by_severity"].values()) == summary.data["total_findings"]


def test_forecast_projects_from_period_trend(ctx: AgentContext) -> None:
    result = _run(ctx)
    forecast = next(f for f in result.findings if f.code == "CASH_FORECAST")
    d = forecast.data
    assert d["horizon_days"] == 30
    expected = round(d["current_balance"] + d["daily_net_avg"] * 30, 2)
    assert d["projected_balance"] == expected


def test_rerun_is_idempotent(ctx: AgentContext) -> None:
    _run(ctx)
    n = len(ctx.memory.findings)
    _run(ctx)
    assert len(ctx.memory.findings) == n


def test_api_run(client, data_dir: Path) -> None:
    r = client.post("/api/agents/audit/run", json={"start": "2026-01-01", "end": "2026-03-31"})
    assert r.status_code == 200
    body = r.json()
    assert any(f["code"] == "AUDIT_SUMMARY" for f in body["findings"])
