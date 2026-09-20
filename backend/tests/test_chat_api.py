def test_chat_requires_llm(client) -> None:
    # conftest monkeypatches openai_api_key to None -> NullLLM
    r = client.post("/api/chat", json={"message": "hello"})
    assert r.status_code == 503
    assert "OPENAI_API_KEY" in r.json()["detail"]


def test_sessions_crud(client) -> None:
    assert client.get("/api/chat/sessions").json() == []
    assert client.get("/api/chat/sessions/nope").status_code == 404
    assert client.delete("/api/chat/sessions/nope").status_code == 404
