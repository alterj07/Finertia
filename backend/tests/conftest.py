import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

LAB_DATA = Path("/home/alterj07/Downloads/finance-agent-lab/data")
DATA_DIR = Path(os.environ.get("DATA_DIR", LAB_DATA))


@pytest.fixture()
def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "memory_graph_path", tmp_path / "memory_graph.json")
    monkeypatch.setattr(settings, "feedback_path", tmp_path / "feedback.json")
    monkeypatch.setattr(settings, "data_dir", DATA_DIR)
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(scope="session")
def data_dir() -> Path:
    if not DATA_DIR.is_dir():
        pytest.skip(f"DATA_DIR not found: {DATA_DIR}")
    return DATA_DIR
