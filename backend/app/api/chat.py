from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.orchestrator import Orchestrator
from app.chat.models import ChatResponse, ChatSession
from app.chat.service import ChatService
from app.chat.tools import build_tools

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    context: str | None = None


def _service(request: Request) -> ChatService:
    app = request.app
    llm = app.state.llm
    if not llm.available:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY not set — the chatbot needs an LLM provider",
        )
    if getattr(app.state, "lake", None) is None:
        raise HTTPException(
            status_code=503,
            detail="Data lake not loaded — set DATA_DIR to a directory containing "
            "bank_transactions.csv, general_ledger.parquet, vendor_invoices.jsonl and emails/.",
        )
    ctx = AgentContext(
        lake=app.state.lake,
        memory=app.state.memory,
        feedback=app.state.feedback,
        llm=llm,
    )
    orchestrator = Orchestrator(app.state.registry, llm)
    return ChatService(
        llm=llm,
        tools=build_tools(ctx, app.state.registry, orchestrator),
        sessions=app.state.chat_sessions,
        memory=app.state.memory,
    )


@router.post("")
def post_chat(req: ChatRequest, request: Request) -> ChatResponse:
    service = _service(request)
    try:
        return service.respond(req.session_id, req.message, context=req.context)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"LLM provider error: {type(exc).__name__}"
        ) from exc


@router.get("/sessions")
def list_sessions(request: Request) -> list[dict]:
    return request.app.state.chat_sessions.list()


@router.get("/sessions/{session_id}")
def get_session(session_id: str, request: Request) -> ChatSession:
    session = request.app.state.chat_sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, request: Request) -> dict:
    if not request.app.state.chat_sessions.delete(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    return {"status": "ok"}
