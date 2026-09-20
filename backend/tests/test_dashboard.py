"""Dashboard builders: honest N/A before agents run, real numbers after."""

import pytest

from app.agents.base import AgentContext
from app.agents.registry import default_registry
from app.dashboard import screens

SCREENS = [
    "command_center",
    "payables",
    "receivables",
    "reconciliation",
    "close",
    "forecast",
    "audit",
]


def _build(name, ctx):
    return getattr(screens, f"build_{name}")(ctx.lake, ctx.memory)


@pytest.fixture()
def seeded(ctx: AgentContext) -> AgentContext:
    ctx.memory.seed(ctx.lake)
    return ctx


@pytest.fixture()
def run(seeded: AgentContext) -> AgentContext:
    reg = default_registry()
    reg.get("Cash & Reconciliation").run(seeded)
    reg.get("AP/AR").run(seeded)
    return seeded


def test_empty_state_needs_run(seeded) -> None:
    for name in SCREENS:
        out = _build(name, seeded)
        if name == "audit":
            continue  # audit has no needs_run; log is just empty
        assert out["needs_run"] is True, name
    cc = _build("command_center", seeded)
    values = {k["label"]: k["value"] for k in cc["kpis"]}
    assert values["Cash"] != "N/A"  # computable from the lake
    assert values["Runway"] == "N/A"
    assert values["AR outstanding"] != "N/A"  # falls back to open_items


def test_after_agents(run) -> None:
    ctx = run
    cc = _build("command_center", ctx)
    kpis = {k["label"]: k["value"] for k in cc["kpis"]}
    cash = ctx.lake.gl_cash_balance("2026-03-31")
    assert kpis["Cash"] == f"${cash:,.2f}"
    aging = next(f for f in ctx.memory.findings if f.code == "AR_AGING")
    assert kpis["AR outstanding"] == f"${aging.data['open_ar_total']:,.2f}"

    rec = _build("reconciliation", ctx)
    assert "difference $0.00" in rec["accounts"][0]["secondary"]

    close = _build("close", ctx)
    bank = next(i for i in close["checklist"] if "Bank reconciliation" in i["label"])
    assert bank["status"] == "done"

    pay = _build("payables", ctx)
    assert "INV-7781" in {r["id"] for r in pay["queue"]}
    inv = screens.build_payables_invoice(ctx.lake, ctx.memory, "INV-7781")
    assert inv is not None and inv["finding"]["key"] == "INV-7781"
    assert screens.build_payables_invoice(ctx.lake, ctx.memory, "NOPE") is None

    recv = _build("receivables", ctx)
    assert any("AR-1044" in r["primary"] for r in recv["collections"])

    fc = _build("forecast", ctx)
    assert fc["opening"] == cash
    assert len(fc["weeks"]) == 13


def test_api(client) -> None:
    for screen in [
        "command-center",
        "payables",
        "receivables",
        "reconciliation",
        "close",
        "forecast",
        "audit",
    ]:
        r = client.get(f"/api/dashboard/{screen}")
        assert r.status_code == 200, screen
    assert client.get("/api/dashboard/payables/invoices/NOPE-9").status_code == 404
    assert client.get("/api/dashboard/nonsense").status_code == 404
