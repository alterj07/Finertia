from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.deals.agent import DealsAgent

router = APIRouter(tags=["deals"])


def _ctx(request: Request) -> AgentContext:
    lake = getattr(request.app.state, "lake", None)
    if lake is None:
        raise HTTPException(status_code=503, detail="Data lake not loaded — set DATA_DIR.")
    return AgentContext(
        lake=lake,
        memory=request.app.state.memory,
        feedback=request.app.state.feedback,
        llm=request.app.state.llm,
    )


class DealsRequest(BaseModel):
    as_of: str = "2026-04-03"


@router.post("/agents/deals/run")
def run_deals(req: DealsRequest, request: Request) -> dict:
    result = DealsAgent().run(_ctx(request), as_of=req.as_of)
    return {
        "summary": result.summary,
        "findings": [f.model_dump(mode="json") for f in result.findings],
    }


@router.get("/deals")
def list_deals(request: Request) -> dict:
    """Inbox triage for the Deals screen: every email with the agent's verdict, and a
    suggested reply for each deal. Runs the (idempotent, deterministic) agent."""
    result = DealsAgent().run(_ctx(request))
    by_email = {f.key: f for f in result.findings}
    items = []
    for t in result.summary["triage"]:
        f = by_email.get(t["email"])
        node = request.app.state.memory.nodes.get(t["email"])
        items.append(
            {
                **t,
                "body": (node.props.get("text") if node else "") or "",
                "finding_id": f"finding:DEAL:{f.key}" if f else None,
                "value_estimate": f.amount if f else None,
                "credit_risk": (f.data or {}).get("facts", {}).get("credit_risk") if f else None,
                "history": (f.data or {}).get("facts", {}).get("history") if f else None,
                "draft": (f.data or {}).get("draft") if f else None,
                "evidence": f.evidence if f else [],
            }
        )
    return {
        "as_of": result.summary["as_of"],
        "pipeline_estimate": result.summary["pipeline_estimate"],
        "deals": result.summary["deals"],
        "items": items,
    }
