from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.auth.service import AuthService
from app.auth.store import LocalUserStore
from app.config import settings
from app.main import create_app


def _login(client: TestClient, identifier: str, password: str) -> str:
    res = client.post(
        "/api/auth/login", json={"identifier": identifier, "password": password}
    )
    assert res.status_code == 200, res.text
    return res.json()["token"]


def test_admin_login_and_me(client: TestClient) -> None:
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["role"] == "admin"
    assert res.json()["username"] == "admin"


def test_login_wrong_password(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login", json={"identifier": "admin", "password": "nope-nope"}
    )
    assert res.status_code == 401


def test_signup_login_me(client: TestClient) -> None:
    res = client.post(
        "/api/auth/signup",
        json={"email": "ada@example.com", "password": "password123", "name": "Ada"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["token"] and body["user"]["email"] == "ada@example.com"
    anon = TestClient(client.app)
    anon.headers["Authorization"] = f"Bearer {body['token']}"
    me = anon.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"
    # email works as the login identifier too
    token = _login(client, "ada@example.com", "password123")
    assert token


def test_signup_duplicate(client: TestClient) -> None:
    payload = {"email": "bob@example.com", "password": "password123"}
    assert client.post("/api/auth/signup", json=payload).status_code == 201
    res = client.post("/api/auth/signup", json=payload)
    assert res.status_code == 409


def test_signup_validation(client: TestClient) -> None:
    assert (
        client.post(
            "/api/auth/signup",
            json={"email": "not-an-email", "password": "password123"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/auth/signup", json={"email": "x@example.com", "password": "short"}
        ).status_code
        == 422
    )


def test_anon_blocked_but_health_open(client: TestClient) -> None:
    anon = TestClient(client.app)
    assert anon.get("/api/dashboard/command-center").status_code == 401
    assert anon.get("/api/health").status_code == 200


def test_auth_disabled_lets_anon_in(tmp_path, monkeypatch, data_dir) -> None:
    monkeypatch.setattr(settings, "memory_graph_path", tmp_path / "memory_graph.json")
    monkeypatch.setattr(settings, "feedback_path", tmp_path / "feedback.json")
    monkeypatch.setattr(settings, "chat_sessions_path", tmp_path / "chat_sessions.json")
    monkeypatch.setattr(settings, "users_path", tmp_path / "users.json")
    monkeypatch.setattr(
        settings, "demo_admin_password", SecretStr("test-admin-pw")
    )
    monkeypatch.setattr(settings, "data_dir", data_dir)
    monkeypatch.setattr(settings, "openai_api_key", None)
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "auto_run_agents", False)
    monkeypatch.setattr(settings, "auth_required", False)
    with TestClient(create_app()) as c:
        assert c.get("/api/dashboard/command-center").status_code == 200


def test_chat_sessions_are_per_user(client: TestClient) -> None:
    # sign up a second user on the same app
    res = client.post(
        "/api/auth/signup",
        json={"email": "eve@example.com", "password": "password123"},
    )
    assert res.status_code == 201
    eve = TestClient(client.app)
    eve.headers["Authorization"] = f"Bearer {res.json()['token']}"

    # create a session owned by admin directly through the store — POST /api/chat
    # needs an LLM, which tests don't have; ownership is enforced at the API layer.
    app = client.app
    session = app.state.chat_sessions.create(user_id="admin")

    assert client.get(f"/api/chat/sessions/{session.id}").status_code == 200
    assert eve.get(f"/api/chat/sessions/{session.id}").status_code == 404
    assert session.id not in {s["id"] for s in eve.get("/api/chat/sessions").json()}
    assert eve.delete(f"/api/chat/sessions/{session.id}").status_code == 404
    assert client.delete(f"/api/chat/sessions/{session.id}").status_code == 200


def test_admin_not_seeded_without_password(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "demo_admin_password", None)
    auth = AuthService(LocalUserStore(tmp_path / "users.json"), settings)
    assert auth.seed_admin() is None
    assert auth.store.find("admin") is None
    assert auth.login("admin", "anything") is None


def test_admin_password_rotation(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "demo_admin_password", SecretStr("old-pw-123"))
    auth = AuthService(LocalUserStore(tmp_path / "users.json"), settings)
    auth.seed_admin()
    assert auth.login("admin", "old-pw-123") is not None

    monkeypatch.setattr(settings, "demo_admin_password", SecretStr("new-pw-456"))
    auth.seed_admin()
    assert auth.login("admin", "old-pw-123") is None
    assert auth.login("admin", "new-pw-456") is not None
