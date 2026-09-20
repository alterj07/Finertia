import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.agents.base import AgentContext
from app.agents.feedback import FeedbackStore
from app.config import settings
from app.data.lake import DataLake
from app.main import create_app
from app.memory.graph import MemoryGraph

LAB_DATA = Path(__file__).resolve().parents[2] / "data"
DATA_DIR = Path(os.environ.get("DATA_DIR", LAB_DATA))


@pytest.fixture()
def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "memory_graph_path", tmp_path / "memory_graph.json")
    monkeypatch.setattr(settings, "feedback_path", tmp_path / "feedback.json")
    monkeypatch.setattr(settings, "chat_sessions_path", tmp_path / "chat_sessions.json")
    monkeypatch.setattr(settings, "users_path", tmp_path / "users.json")
    monkeypatch.setattr(settings, "data_dir", DATA_DIR)
    monkeypatch.setattr(settings, "openai_api_key", None)
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "auto_run_agents", False)
    with TestClient(create_app()) as c:
        token = c.post(
            "/api/auth/login", json={"identifier": "admin", "password": "password"}
        ).json()["token"]
        c.headers["Authorization"] = f"Bearer {token}"
        yield c


@pytest.fixture()
def anon_client(client: TestClient) -> TestClient:
    anon = TestClient(client.app)
    anon.headers.pop("Authorization", None)
    return anon


@pytest.fixture(scope="session")
def data_dir() -> Path:
    if not DATA_DIR.is_dir():
        pytest.skip(f"DATA_DIR not found: {DATA_DIR}")
    return DATA_DIR


@pytest.fixture()
def ctx(data_dir: Path, tmp_path: Path) -> AgentContext:
    return AgentContext(
        lake=DataLake.from_dir(data_dir),
        memory=MemoryGraph(tmp_path / "memory_graph.json"),
        feedback=FeedbackStore(tmp_path / "feedback.json"),
    )
