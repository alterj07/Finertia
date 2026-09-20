"""Deals agent: deterministic triage of the inbox plus grounded reply drafts."""

from app.agents.apar.agent import APARAgent
from app.agents.base import AgentContext
from app.agents.deals.agent import DealsAgent

DEALS = {
    "013_apex_expansion.eml",
    "014_stratos_rfq.eml",
    "015_harborview_inbound.eml",
    "016_bluewater_renewal.eml",
    "017_crescent_order.eml",
    "019_redwood_pricing.eml",
}


def _run(ctx: AgentContext):
    ctx.memory.seed(ctx.lake)
    APARAgent().run(ctx)  # so promises / disputes are in memory for the credit check
    return DealsAgent().run(ctx, as_of="2026-04-03")


def test_triage_separates_deals_from_operations(ctx: AgentContext) -> None:
    result = _run(ctx)
    triage = {t["email"]: t for t in result.summary["triage"]}
    assert {k for k, t in triage.items() if t["is_deal"]} == DEALS
    assert triage["018_vantage_upsell.eml"]["is_deal"] is False  # a vendor selling to us
    assert "vendor" in triage["018_vantage_upsell.eml"]["reason"]
    assert triage["001_brightline_resend.eml"]["is_deal"] is False
    assert triage["015_harborview_inbound.eml"]["stage"] == "New inbound"
    assert triage["016_bluewater_renewal.eml"]["stage"] == "Renewal"
    assert triage["014_stratos_rfq.eml"]["stage"] == "RFQ"
    assert triage["013_apex_expansion.eml"]["stage"] == "Expansion"
    assert result.summary["deals"] == 6


def test_deals_are_sized_and_credit_checked(ctx: AgentContext) -> None:
    result = _run(ctx)
    by_key = {f.key: f for f in result.findings}
    assert by_key["014_stratos_rfq.eml"].amount == 480000.0
    apex = by_key["013_apex_expansion.eml"]
    assert apex.data["facts"]["units"] == 40 and apex.amount > 0
    crescent = by_key["017_crescent_order.eml"]
    assert crescent.severity == "high" and "overdue" in crescent.data["facts"]["credit_risk"]
    assert "2026-04-15" in crescent.data["facts"]["credit_risk"]
    assert "past due" in crescent.data["draft"]["body"]
    assert "finding:PROMISE_TO_PAY:C007" in crescent.evidence
    harbor = by_key["015_harborview_inbound.eml"]
    assert harbor.data["facts"]["is_existing_customer"] is False
    assert harbor.data["draft"]["to"] == "lena.park@harborviewlogistics.com"
    assert harbor.data["draft"]["subject"].startswith("Re: ")


def test_deals_rerun_idempotent(ctx: AgentContext) -> None:
    r1 = _run(ctx)
    r2 = DealsAgent().run(ctx, as_of="2026-04-03")
    assert len(r1.findings) == len(r2.findings) == 6
    assert [f.data["draft"]["body"] for f in r1.findings] == [
        f.data["draft"]["body"] for f in r2.findings
    ]


def test_deals_api(client) -> None:
    r = client.get("/api/deals")
    assert r.status_code == 200
    body = r.json()
    assert body["deals"] == 6 and len(body["items"]) == 19
    deal = next(i for i in body["items"] if i["email"] == "014_stratos_rfq.eml")
    assert deal["draft"]["body"] and deal["value_estimate"] == 480000.0
    assert client.get("/api/memory/findings", params={"code": "DEAL"}).json()
    view = client.get("/api/memory/graph/view").json()
    assert any(n["id"] == "agent-deals" and n["lastTouched"] == "live" for n in view["nodes"])
