from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.agents.feedback import Adjustment

router = APIRouter(prefix="/feedback", tags=["feedback"])


class AdjustmentIn(BaseModel):
    agent: str
    kind: str
    payload: dict = {}
    reason: str = ""


@router.get("")
def list_feedback(request: Request, agent: str | None = None) -> list[dict]:
    store = request.app.state.feedback
    items = store.for_agent(agent) if agent else store.adjustments
    return [a.model_dump(mode="json") for a in items]


@router.post("")
def add_feedback(adj: AdjustmentIn, request: Request) -> dict:
    adjustment = Adjustment(**adj.model_dump())
    request.app.state.feedback.add(adjustment)
    return adjustment.model_dump(mode="json")


@router.delete("/{adjustment_id}")
def delete_feedback(adjustment_id: str, request: Request) -> dict:
    if not request.app.state.feedback.remove(adjustment_id):
        raise HTTPException(status_code=404, detail="Adjustment not found")
    return {"status": "ok"}
