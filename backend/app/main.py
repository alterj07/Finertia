from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.feedback import FeedbackStore
from app.api.router import api_router
from app.config import settings
from app.data.lake import DataLake
from app.memory.graph import MemoryGraph


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.lake = (
        DataLake.from_dir(settings.data_dir) if settings.data_dir.is_dir() else None
    )
    app.state.memory = MemoryGraph(settings.memory_graph_path)
    if app.state.lake is not None:
        app.state.memory.seed(app.state.lake)
    app.state.feedback = FeedbackStore(settings.feedback_path)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app


app = create_app()
