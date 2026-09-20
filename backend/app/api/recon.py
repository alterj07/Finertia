from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.agents.apar.agent import APARAgent
from app.agents.audit.agent import AuditAgent
from app.agents.base import AgentContext
from app.agents.recon.agent import ReconAgent

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
        llm=request.app.state.llm,
    )
    result = ReconAgent().run(ctx, start=req.start, end=req.end)
    return {
        "summary": result.summary,
        "findings": [f.model_dump(mode="json") for f in result.findings],
        "matches": result.summary.get("matches", []),
    }


class APARRequest(BaseModel):
    start: str = "2026-01-01"
    end: str = "2026-03-31"
    pay_within_days: int = 7


@router.post("/apar/run")
def run_apar(req: APARRequest, request: Request) -> dict:
    lake = getattr(request.app.state, "lake", None)
    if lake is None:
        raise HTTPException(status_code=503, detail="Data lake not loaded — set DATA_DIR.")
    ctx = AgentContext(
        lake=lake,
        memory=request.app.state.memory,
        feedback=request.app.state.feedback,
        llm=request.app.state.llm,
    )
    result = APARAgent().run(ctx, **req.model_dump())
    return {
        "summary": result.summary,
        "findings": [f.model_dump(mode="json") for f in result.findings],
    }


class AuditRequest(BaseModel):
    start: str = "2026-01-01"
    end: str = "2026-03-31"


@router.post("/audit/run")
def run_audit(req: AuditRequest, request: Request) -> dict:
    lake = getattr(request.app.state, "lake", None)
    if lake is None:
        raise HTTPException(status_code=503, detail="Data lake not loaded — set DATA_DIR.")
    ctx = AgentContext(
        lake=lake,
        memory=request.app.state.memory,
        feedback=request.app.state.feedback,
        llm=request.app.state.llm,
    )
    result = AuditAgent().run(ctx, start=req.start, end=req.end)
    return {
        "summary": result.summary,
        "findings": [f.model_dump(mode="json") for f in result.findings],
    }
