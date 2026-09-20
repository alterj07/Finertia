from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.memory.models import Finding

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("/graph")
def get_graph(
    request: Request,
    types: list[str] | None = Query(default=None),
    period: str | None = None,
) -> dict:
    """Whole graph (or a slice) as {nodes, edges, findings}; feed it to a force-graph view."""
    return request.app.state.memory.to_dict(types=types, period=period)


@router.get("/graph/view")
def get_graph_view(request: Request) -> dict:
    """The graph shaped for the Data Graph screen: aggregates, edges, expansions."""
    from app.memory.view import graph_view

    return graph_view(request.app.state.memory)


@router.get("/stats")
def get_stats(request: Request) -> dict:
    return request.app.state.memory.stats()


@router.get("/node")
def get_node(request: Request, id: str) -> dict:
    g = request.app.state.memory
    nid = g.resolve(id)
    if nid not in g.nodes:
        raise HTTPException(status_code=404, detail=f"unknown node {id}")
    return {
        "node": g.nodes[nid].model_dump(),
        "out": [e.model_dump() for e in g.out_edges(nid)],
        "in": [e.model_dump() for e in g.in_edges(nid)],
    }


@router.get("/context")
def get_context(request: Request, id: str, depth: int = 2, max_nodes: int = 60) -> dict:
    """Prompt-ready context pack for an agent: the node, its neighbourhood, prior findings."""
    return request.app.state.memory.context(id, depth=depth, max_nodes=max_nodes)


@router.get("/search")
def search(
    request: Request, q: str, types: list[str] | None = Query(default=None), k: int = 10
) -> list[dict]:
    return [
        {"score": s, **n.model_dump()}
        for s, n in request.app.state.memory.search(q, types=types, k=k)
    ]


@router.get("/signals")
def get_signals(
    request: Request, period: str | None = None, agent: str | None = None
) -> list[dict]:
    """Structural leads the graph surfaces on its own, routed by suggested agent."""
    return [s.model_dump() for s in request.app.state.memory.signals(period=period, agent=agent)]


@router.get("/precedents")
def get_precedents(request: Request, party: str) -> dict:
    return request.app.state.memory.precedents(party)


@router.get("/findings")
def get_findings(request: Request, code: str | None = None, agent: str | None = None) -> list[dict]:
    return [
        f.model_dump(mode="json") for f in request.app.state.memory.recall(code=code, agent=agent)
    ]


class FindingIn(BaseModel):
    agent: str
    code: str
    key: str
    title: str
    detail: str = ""
    severity: str = "medium"
    amount: float | None = None
    entities: list[str] = []
    evidence: list[str] = []
    data: dict | None = None


@router.post("/findings")
def post_finding(body: FindingIn, request: Request) -> dict:
    """Let any agent (or a human reviewer) write a finding into shared memory."""
    f = request.app.state.memory.remember(Finding(**body.model_dump()))
    return f.model_dump(mode="json")


@router.post("/reset")
def reset(request: Request) -> dict:
    request.app.state.memory.reset()
    return {"status": "ok"}
