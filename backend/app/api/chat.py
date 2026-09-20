from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.agents.base import AgentContext
from app.agents.orchestrator import Orchestrator
from app.auth.deps import current_user
from app.auth.models import User
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
def post_chat(
    req: ChatRequest, request: Request, user: User = Depends(current_user)
) -> ChatResponse:
    service = _service(request)
    session_id = req.session_id
    if session_id:
        existing = request.app.state.chat_sessions.get(session_id)
        if existing is not None and existing.user_id and existing.user_id != user.id:
            session_id = None
    try:
        return service.respond(
            session_id, req.message, context=req.context, user_id=user.id
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"LLM provider error: {type(exc).__name__}"
        ) from exc


@router.get("/sessions")
def list_sessions(request: Request, user: User = Depends(current_user)) -> list[dict]:
    return [
        s
        for s in request.app.state.chat_sessions.list()
        if not s["user_id"] or s["user_id"] == user.id
    ]


@router.get("/sessions/{session_id}")
def get_session(
    session_id: str, request: Request, user: User = Depends(current_user)
) -> ChatSession:
    session = request.app.state.chat_sessions.get(session_id)
    if session is None or (session.user_id and session.user_id != user.id):
        raise HTTPException(status_code=404, detail="session not found")
    return session


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str, request: Request, user: User = Depends(current_user)
) -> dict:
    session = request.app.state.chat_sessions.get(session_id)
    if session is None or (session.user_id and session.user_id != user.id):
        raise HTTPException(status_code=404, detail="session not found")
    request.app.state.chat_sessions.delete(session_id)
    return {"status": "ok"}
