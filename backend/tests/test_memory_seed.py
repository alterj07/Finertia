"""The seeded base layer must expose every planted trap as a graph query."""

import json
from pathlib import Path

import pytest

from app.agents.base import AgentContext
from app.agents.feedback import FeedbackStore
from app.agents.recon.agent import CashReconAgent
from app.data.lake import DataLake
from app.memory.graph import MemoryGraph
from app.memory.models import Finding


@pytest.fixture(scope="module")
def lake(data_dir: Path) -> DataLake:
    return DataLake.from_dir(data_dir)


@pytest.fixture()
def graph(lake: DataLake, tmp_path: Path) -> MemoryGraph:
    return MemoryGraph(tmp_path / "memory_graph.json").seed(lake)


def test_seed_counts(graph: MemoryGraph) -> None:
    s = graph.stats()
    assert s["node_types"]["invoice"] == 33  # 34 rows, INV-7781 merged with INV7781
    assert s["node_types"]["bank_txn"] == 55
    assert s["node_types"]["email"] == 19
    assert s["node_types"]["scan"] == 6
    assert s["node_types"]["vendor"] == 12
    assert s["node_types"]["customer"] == 10
    assert s["edge_types"]["CLEARS"] >= 50


def test_duplicate_invoice_merged(graph: MemoryGraph) -> None:
    inv = graph.nodes[graph.resolve("INV7781")]
    assert inv.id == "INV-7781"
    assert sorted(inv.props["variants"]) == ["INV-7781", "INV7781"]
    assert inv.props["posted_count"] == 2 and inv.props["paid_count"] == 2
    assert {e.src for e in graph.in_edges(inv.id, "SETTLES")} == {"BK00037", "BK00041"}
    assert "001_brightline_resend.eml" in {e.src for e in graph.in_edges(inv.id, "MENTIONS")}
    assert "scan_brightline_INV7781.png" in {e.src for e in graph.in_edges(inv.id, "SCAN_OF")}


def test_lookalike_domain_flagged(graph: MemoryGraph) -> None:
    e = graph.edge("003_cloudnimbus_bank_change.eml", "MENTIONS", "V007")
    assert e and e.props["lookalike_domain"] is True
    assert graph.edge("003_cloudnimbus_bank_change.eml", "MENTIONS", "acct:****9921")
    assert graph.nodes["V007"].props["usual_remit_account"] == "acct:****4410"


def test_remittance_explains_lump_sum(graph: MemoryGraph) -> None:
    assert graph.edge("006_helios_remittance.eml", "EXPLAINS", "BK00044")
    settled = {e.dst for e in graph.out_edges("BK00044", "SETTLES")}
    assert settled == {"AR-1033", "AR-1034", "AR-1036"}


def test_signals_cover_ground_truth(graph: MemoryGraph, data_dir: Path) -> None:
    truth = json.loads((data_dir / "ground_truth.json").read_text())
    signals = graph.signals()
    by_code = {}
    for s in signals:
        by_code.setdefault(s.code, []).append(s)
    missing = []
    for trap in truth["traps"]:
        hits = by_code.get(trap["code"], [])
        key = trap["key"].split(" / ")[0]
        ok = [
            s
            for s in hits
            if key.replace("-", "") in (s.key + " ".join(s.entities)).replace("-", "")
        ]
        if trap["amount"] is not None:
            ok = [
                s for s in ok if s.amount is not None and abs(abs(s.amount) - trap["amount"]) < 0.01
            ]
        if not ok:
            missing.append((trap["id"], trap["code"], trap["key"], [s.key for s in hits]))
    assert not missing, missing


def test_context_and_search(graph: MemoryGraph) -> None:
    ctx = graph.context("INV7781", depth=2)
    assert ctx["focus"]["id"] == "INV-7781"
    assert "BK00041" in ctx["text"] and "001_brightline_resend.eml" in ctx["text"]
    hits = graph.search("damaged units short payment", types=["email"])
    assert hits and hits[0][1].id == "005_orbit_short_pay.eml"
    prec = graph.precedents("V009")
    assert [d["id"] for d in prec["documents"]] == ["SCG-1102", "SCG-1187"]


def test_recon_findings_attach_to_seeded_nodes(lake: DataLake, tmp_path: Path) -> None:
    g = MemoryGraph(tmp_path / "g.json").seed(lake)
    ctx = AgentContext(lake=lake, memory=g, feedback=FeedbackStore(tmp_path / "fb.json"))
    CashReconAgent().run(ctx, start="2026-01-01", end="2026-03-31")
    fx = "finding:FX_DIFFERENCE:BP-4471"
    targets = {e.dst for e in g.out_edges(fx)}
    assert "BP-4471" in targets and g.nodes["BP-4471"].type == "invoice"
    assert all(g.nodes[t].type != "entity" for t in targets)
    # findings show up in the context of the invoice they are about
    assert "FX_DIFFERENCE" in g.context("BP-4471")["text"]
    # reload keeps both layers
    g2 = MemoryGraph(tmp_path / "g.json")
    assert len(g2.findings) == len(g.findings) and "INV-7781" in g2.nodes


def test_remember_resolves_aliases(graph: MemoryGraph) -> None:
    graph.remember(
        Finding(
            agent="AP/AR",
            code="DUPLICATE_PAYMENT",
            key="INV-7781",
            title="dup",
            entities=["INV7781", "V003"],
            evidence=["BK00037"],
        )
    )
    assert graph.edge("finding:DUPLICATE_PAYMENT:INV-7781", "INVOLVES", "INV-7781")


def test_api_endpoints(client) -> None:
    assert client.get("/api/memory/stats").json()["nodes"] > 300
    assert (
        client.get("/api/memory/node", params={"id": "INV7781"}).json()["node"]["id"] == "INV-7781"
    )
    assert "INV-7781" in client.get("/api/memory/context", params={"id": "INV-7781"}).json()["text"]
    sig = client.get("/api/memory/signals", params={"agent": "Audit & Controls"}).json()
    assert {s["code"] for s in sig} >= {"VENDOR_BANK_CHANGE", "SOD_VIOLATION"}
    r = client.post(
        "/api/memory/findings",
        json={
            "agent": "Audit & Controls",
            "code": "VENDOR_BANK_CHANGE",
            "key": "CN-2026-03",
            "title": "remit-to changed after look-alike email",
            "entities": ["V007", "CN-2026-03"],
            "evidence": ["003_cloudnimbus_bank_change.eml", "BK00051"],
        },
    )
    assert r.status_code == 200
    assert client.get("/api/memory/findings", params={"code": "VENDOR_BANK_CHANGE"}).json()
    assert client.get("/api/memory/search", params={"q": "First Coastal 9921"}).json()


def test_reload_then_reseed_matches_fresh(lake: DataLake, tmp_path: Path) -> None:
    path = tmp_path / "g.json"
    fresh = MemoryGraph(path).seed(lake)
    fresh.remember(
        Finding(
            agent="AP/AR", code="X", key="1", title="t", entities=["INV7781"], evidence=["BK00037"]
        )
    )
    stats = fresh.stats()
    again = MemoryGraph(path).seed(lake)  # loads the saved file, then re-seeds on top
    assert again.stats() == stats
    assert again.nodes["INV-7781"].props["variants"] == ["INV-7781", "INV7781"]
    assert [d["id"] for d in again.precedents("V009")["documents"]] == ["SCG-1102", "SCG-1187"]
    assert again.edge("finding:X:1", "INVOLVES", "INV-7781")


def test_graph_view_shape(graph: MemoryGraph) -> None:
    from app.memory.view import graph_view

    graph.remember(
        Finding(
            agent="Cash & Reconciliation",
            code="FX_DIFFERENCE",
            key="BP-4471",
            title="fx",
            entities=["V011", "BP-4471"],
            evidence=["BK00049", "JE-1061"],
        )
    )
    view = graph_view(graph)
    ids = {n["id"] for n in view["nodes"]}
    assert sum(n.get("isAgent", False) for n in view["nodes"]) == 7
    assert {"V003", "C007", "acct:****0042", "finding:FX_DIFFERENCE:BP-4471"} <= ids
    for e in view["edges"]:
        assert e["source"] in ids and e["target"] in ids
    assert {"source": "finding:FX_DIFFERENCE:BP-4471", "target": "V011"} in view["edges"]
    v003 = view["expansions"]["V003"]
    exp_ids = {n["id"] for n in v003["nodes"]} | ids
    assert "INV-7781" in exp_ids and "BK00041" in exp_ids and "001_brightline_resend.eml" in exp_ids
    for e in v003["edges"]:
        assert e["source"] in exp_ids and e["target"] in exp_ids, e
    assert all(n["group"] == "payables" for n in view["nodes"] if n["id"].startswith("V0"))
