from app.agents.recon.agent import ReconAgent
from app.agents.registry import default_registry


def test_default_registry() -> None:
    reg = default_registry()
    assert reg.names() == ["Cash & Reconciliation", "AP/AR", "Deals", "Audit & Controls"]
    spec = reg.specs()[0]
    assert spec.name == "Cash & Reconciliation"
    assert "start" in spec.params and "end" in spec.params
    assert spec.params["start"]["default"] == "2026-01-01"
    assert "bank" in spec.capabilities or "cash" in spec.capabilities


def test_get_returns_fresh_instance() -> None:
    reg = default_registry()
    a, b = reg.get("Cash & Reconciliation"), reg.get("Cash & Reconciliation")
    assert isinstance(a, ReconAgent)
    assert a is not b
