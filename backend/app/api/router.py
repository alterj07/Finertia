from fastapi import APIRouter

from app.api import chat, deals, feedback, health, memory, orchestrator, recon

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(recon.router)
api_router.include_router(memory.router)
api_router.include_router(feedback.router)
api_router.include_router(orchestrator.router)
api_router.include_router(deals.router)
api_router.include_router(chat.router)
