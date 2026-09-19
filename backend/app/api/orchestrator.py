from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.agents.base import AgentContext, AgentSpec
from app.agents.orchestrator import OrchestrationResult, Orchestrator

router = APIRouter(tags=["orchestrator"])


@router.get("/agents")
def list_agents(request: Request) -> list[AgentSpec]:
    return request.app.state.registry.specs()


class OrchestrateRequest(BaseModel):
    request: str
    defaults: dict = {}


@router.post("/orchestrator/run")
def run_orchestrator(req: OrchestrateRequest, request: Request) -> OrchestrationResult:
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
    return Orchestrator(request.app.state.registry, request.app.state.llm).run(
        ctx, req.request, defaults=req.defaults
    )
