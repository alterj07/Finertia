"""Audit agent: controls, a findings rollup, and a lightweight cash forecast.

Deliberately small — three cheap, deterministic checks over what the other
agents and the seeded graph already know, not a fourth full rules engine:

  1. Auditing   — turns SOD_VIOLATION signals (self-approved / off-hours /
     round-amount manual journals — see app/memory/signals.py) into findings.
     Nobody else consumes that signal today, so this is a real gap it closes,
     not a duplicate of APARAgent's own checks.
  2. Reporting   — one rollup finding of open findings by severity/agent,
     for a controls-summary view.
  3. Forecasting — a straight-line projection of the GL cash balance from
     the period's own trend. Intentionally simple; the dashboard's 13-week
     forecast is a separate, richer view.
"""

from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

from app.agents.base import Agent, AgentContext, AgentResult

_HORIZON_DAYS = 30


def _d(s: str) -> date:
    return date.fromisoformat(str(s)[:10])


class AuditAgent(Agent):
    name = "Audit & Controls"
    description = (
        "Segregation-of-duties checks over manual journal entries (self-approved, "
        "off-hours, round-amount postings), a rollup of open findings across every "
        "agent, and a straight-line cash forecast from the period's own trend."
    )
    capabilities = [
        "audit",
        "controls",
        "segregation of duties",
        "sod",
        "self-approved",
        "compliance",
        "reporting",
        "summary",
        "forecast",
        "forecasting",
        "cash forecast",
    ]
    params_schema = {
        "start": {"type": "string", "format": "date", "default": "2026-01-01"},
        "end": {"type": "string", "format": "date", "default": "2026-03-31"},
    }

    def run(
        self,
        ctx: AgentContext,
        start: str = "2026-01-01",
        end: str = "2026-03-31",
        **_: Any,
    ) -> AgentResult:
        g = ctx.memory
        if not any(e.agent == "ingest" for e in g.edges):
            g.seed(ctx.lake)  # base layer missing (fresh memory): build it from the lake
            self.trace("seeded memory graph from data lake", nodes=len(g.nodes))

        self._controls(ctx)
        self._reporting(ctx, end)
        self._forecast(ctx, start, end)

        return AgentResult(
            agent=self.name,
            findings=[f for f in g.findings if f.agent == self.name],
            summary={"as_of": end},
            trace=self._trace,
        )

    # ---------------------------------------------------------------- audit
    def _controls(self, ctx: AgentContext) -> None:
        """SOD_VIOLATION is a structural signal nothing else turns into a
        finding — that's the whole job here."""
        signals = [s for s in ctx.memory.signals(agent=self.name) if s.code == "SOD_VIOLATION"]
        self.trace("segregation-of-duties signals", rows=len(signals))
        for s in signals:
            self.finding(
                ctx,
                code=s.code,
                key=s.key,
                amount=s.amount,
                severity="high",
                title=s.title,
                detail="Segregation-of-duties exception — verify the approver and "
                "business purpose before period close.",
                entities=s.entities,
                evidence=s.evidence,
            )

    # ------------------------------------------------------------ reporting
    # Housekeeping codes this same agent writes are excluded from its own
    # rollup — a reporting artifact and a forecast projection aren't "open
    # findings" needing review, and counting them would make the rollup's
    # numbers drift on every rerun instead of settling on the period's answer.
    _ROLLUP_EXCLUDE = {"ORCHESTRATION_RUN", "AUDIT_SUMMARY", "CASH_FORECAST"}

    def _reporting(self, ctx: AgentContext, end: str) -> None:
        open_findings = [f for f in ctx.memory.findings if f.code not in self._ROLLUP_EXCLUDE]
        by_severity = Counter(f.severity for f in open_findings)
        by_agent = Counter(f.agent for f in open_findings)
        exposure = round(
            sum(f.amount or 0 for f in open_findings if f.severity in ("critical", "high")), 2
        )
        self.trace("findings rollup", total=len(open_findings))
        self.finding(
            ctx,
            code="AUDIT_SUMMARY",
            key=end,
            amount=exposure,
            severity="info",
            title=f"{len(open_findings)} open findings across {len(by_agent)} agent(s); "
            f"${exposure:,.2f} at critical/high severity",
            detail="; ".join(f"{n} {sev}" for sev, n in by_severity.most_common()),
            data={
                "total_findings": len(open_findings),
                "by_severity": dict(by_severity),
                "by_agent": dict(by_agent),
                "critical_high_exposure": exposure,
            },
        )

    # ----------------------------------------------------------- forecasting
    def _forecast(self, ctx: AgentContext, start: str, end: str) -> None:
        lake = ctx.lake
        opening = lake.gl_cash_balance(start)
        current = lake.gl_cash_balance(end)
        days = max((_d(end) - _d(start)).days, 1)
        daily_net = round((current - opening) / days, 2)
        projected = round(current + daily_net * _HORIZON_DAYS, 2)
        self.trace("cash trend", opening=opening, current=current, daily_net=daily_net)
        self.finding(
            ctx,
            code="CASH_FORECAST",
            key=end,
            amount=projected,
            severity="info",
            title=f"Projected cash in {_HORIZON_DAYS}d: ${projected:,.2f} "
            f"(from ${current:,.2f} at {daily_net:+,.2f}/day)",
            detail=f"Straight-line projection from the {start} to {end} net cash trend. "
            "Not a substitute for the scheduled 13-week forecast.",
            data={
                "as_of": end,
                "current_balance": current,
                "daily_net_avg": daily_net,
                "horizon_days": _HORIZON_DAYS,
                "projected_balance": projected,
            },
        )
