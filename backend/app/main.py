import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.base import AgentContext
from app.agents.feedback import FeedbackStore
from app.agents.llm import build_llm
from app.agents.registry import default_registry
from app.agents.warmup import AgentWarmup
from app.api.router import api_router
from app.chat.sessions import ChatSessionStore
from app.config import settings
from app.data.es_lake import ElasticDataLake
from app.data.es_store import ElasticStore
from app.data.ingest import ingest_lake
from app.data.lake import DataLake
from app.memory.es_sync import ElasticMemorySync
from app.memory.graph import MemoryGraph

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    backend = "local"
    store = None
    if settings.storage_backend == "elastic":
        store = ElasticStore(
            settings.es_url,
            api_key=(
                settings.es_api_key.get_secret_value() if settings.es_api_key else None
            ),
            prefix=settings.es_index_prefix,
        )
        if store.ping():
            needs_ingest = (
                not store.exists("fin-bank")
                or store.count("fin-bank") == 0
                or not store.schema_ok("fin-bank")
            )
            if needs_ingest and settings.data_dir.is_dir():
                log.info("re-ingesting: indices missing/empty/incompatible")
                ingest_lake(DataLake.from_dir(settings.data_dir), store)
                needs_ingest = False
            if needs_ingest:
                log.warning(
                    "fin-* indices missing/empty/incompatible and DATA_DIR %s "
                    "is unavailable; falling back to local",
                    settings.data_dir,
                )
                store = None
            else:
                app.state.lake = ElasticDataLake(
                    store,
                    data_dir=(
                        settings.data_dir if settings.data_dir.is_dir() else None
                    ),
                )
                backend = "elastic"
        else:
            log.warning(
                "STORAGE_BACKEND=elastic but ES unreachable at %s; falling back to local",
                settings.es_url,
            )
            store = None
    if backend == "local":
        app.state.lake = (
            DataLake.from_dir(settings.data_dir)
            if settings.data_dir.is_dir()
            else None
        )
    app.state.es_store = store
    app.state.memory = MemoryGraph(
        None if backend == "elastic" else settings.memory_graph_path
    )
    if app.state.lake is not None:
        app.state.memory.seed(app.state.lake)
    if backend == "elastic":
        app.state.memory.attach_sync(ElasticMemorySync(store))
    app.state.storage = {
        "backend": backend,
        "es_url": settings.es_url if backend == "elastic" else None,
        "memory": "elasticsearch" if backend == "elastic" else "json",
    }
    app.state.feedback = FeedbackStore(settings.feedback_path)
    app.state.llm = build_llm(settings)
    app.state.registry = default_registry()
    app.state.warmup = AgentWarmup(
        lambda: AgentContext(
            lake=app.state.lake,
            memory=app.state.memory,
            feedback=app.state.feedback,
            llm=app.state.llm,
        ),
        app.state.registry,
        app.state.llm,
        settings.auto_run_request,
    )
    if settings.auto_run_agents and app.state.lake is not None:
        app.state.warmup.start()
    app.state.chat_sessions = ChatSessionStore(settings.chat_sessions_path)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app


app = create_app()
