from fastapi import APIRouter, Depends

from app.api import (
    auth,
    chat,
    dashboard,
    deals,
    feedback,
    flight_simulator,
    health,
    memory,
    orchestrator,
    recon,
    storage,
    uploads,
)
from app.auth.deps import current_user

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(recon.router, dependencies=[Depends(current_user)])
api_router.include_router(memory.router, dependencies=[Depends(current_user)])
api_router.include_router(feedback.router, dependencies=[Depends(current_user)])
api_router.include_router(orchestrator.router, dependencies=[Depends(current_user)])
api_router.include_router(deals.router, dependencies=[Depends(current_user)])
api_router.include_router(chat.router, dependencies=[Depends(current_user)])
api_router.include_router(storage.router, dependencies=[Depends(current_user)])
api_router.include_router(dashboard.router, dependencies=[Depends(current_user)])
api_router.include_router(flight_simulator.router, dependencies=[Depends(current_user)])
api_router.include_router(uploads.router, dependencies=[Depends(current_user)])
