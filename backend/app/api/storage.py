from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.data.es_store import MAPPINGS
from app.data.ingest import ingest_lake
from app.data.lake import DataLake

router = APIRouter(tags=["storage"])


@router.get("/storage")
def get_storage(request: Request) -> dict[str, Any]:
    info = dict(request.app.state.storage)
    if info["backend"] == "elastic":
        store = request.app.state.es_store
        info["indices"] = {name: store.count(name) for name in MAPPINGS}
    return info


@router.post("/storage/ingest")
def post_ingest(request: Request) -> dict[str, int]:
    if request.app.state.storage["backend"] != "elastic":
        raise HTTPException(503, "storage backend is not elastic")
    if not settings.data_dir.is_dir():
        raise HTTPException(503, f"DATA_DIR {settings.data_dir} does not exist")
    lake = DataLake.from_dir(settings.data_dir)
    return ingest_lake(lake, request.app.state.es_store)
