from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.recon.agent import CashReconAgent

router = APIRouter(prefix="/agents", tags=["agents"])


class ReconRequest(BaseModel):
    start: str = "2026-01-01"
    end: str = "2026-03-31"


@router.post("/recon/run")
def run_recon(req: ReconRequest, request: Request) -> dict:
    lake = getattr(request.app.state, "lake", None)
    if lake is None:
        raise HTTPException(
            status_code=503,
            detail="Data lake not loaded — set DATA_DIR to a directory containing "
            "bank_transactions.csv, general_ledger.parquet, vendor_invoices.jsonl and emails/.",
        )
    ctx = AgentContext(
        lake=lake,
        memory=request.app.state.memory,
        feedback=request.app.state.feedback,
    )
    result = CashReconAgent().run(ctx, start=req.start, end=req.end)
    return {
        "summary": result.summary,
        "findings": [f.model_dump(mode="json") for f in result.findings],
        "matches": result.summary.get("matches", []),
    }
