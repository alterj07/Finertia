from fastapi import APIRouter

<<<<<<< HEAD
from app.api import chat, dashboard, feedback, health, memory, orchestrator, recon, storage
=======
<<<<<<< HEAD
from app.api import chat, deals, feedback, health, memory, orchestrator, recon
=======
from app.api import chat, feedback, health, memory, orchestrator, recon, storage
>>>>>>> 0ae6d8c84499fe32930736588fadd02c8c9a0fec
>>>>>>> origin/main

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(recon.router)
api_router.include_router(memory.router)
api_router.include_router(feedback.router)
api_router.include_router(orchestrator.router)
api_router.include_router(deals.router)
api_router.include_router(chat.router)
api_router.include_router(storage.router)
api_router.include_router(dashboard.router)
