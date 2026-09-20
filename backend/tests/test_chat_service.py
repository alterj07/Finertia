from pathlib import Path
from typing import Any

import pytest

from app.agents.base import AgentContext
from app.agents.llm import ChatTurn, NullLLM, ToolCall
from app.agents.orchestrator import Orchestrator
from app.agents.registry import default_registry
from app.chat.service import ChatService
from app.chat.sessions import ChatSessionStore
from app.chat.tools import build_tools


class ScriptedLLM:
    available = True

    def __init__(self, turns: list[ChatTurn]) -> None:
        self.turns = list(turns)

    def complete(self, prompt: str, **kw: Any) -> str:
        return ""

    def chat(
        self, messages: list[dict], tools: list[dict] | None = None, **kw: Any
    ) -> ChatTurn:
        return self.turns.pop(0)


@pytest.fixture()
def service(ctx: AgentContext, tmp_path: Path):
    ctx.memory.seed(ctx.lake)
    registry = default_registry()
    tools = build_tools(ctx, registry, Orchestrator(registry, NullLLM()))
    sessions = ChatSessionStore(tmp_path / "sessions.json")
    return ctx, sessions, tools


def _svc(tools, sessions, llm, **kw) -> ChatService:
    return ChatService(llm=llm, tools=tools, sessions=sessions, **kw)


def test_tool_call_loop(service, tmp_path: Path) -> None:
    ctx, sessions, tools = service
    # run the real tool once to learn a real citation id
    cited_id = next(t.fn("helios")["citations"][0] for t in tools if t.name == "search_memory")
    llm = ScriptedLLM(
        [
            ChatTurn(
                content=None,
                tool_calls=[
                    ToolCall(id="c1", name="search_memory", arguments={"query": "helios"})
                ],
            ),
            ChatTurn(content=f"Found it [{cited_id}]."),
        ]
    )
    resp = _svc(tools, sessions, llm).respond(None, "find the helios remittance")
    assert resp.message.content == f"Found it [{cited_id}]."
    assert [e.name for e in resp.tool_events] == ["search_memory"]
    assert cited_id in resp.citations
    roles = [m.role for m in sessions.get(resp.session_id).messages]
    assert roles == ["user", "assistant", "tool", "assistant"]
    # persisted across reload
    reloaded = ChatSessionStore(tmp_path / "sessions.json")
    assert reloaded.get(resp.session_id) is not None
    assert reloaded.get(resp.session_id).title.startswith("find the helios")


def test_unknown_tool(service) -> None:
    ctx, sessions, tools = service
    llm = ScriptedLLM(
        [
            ChatTurn(
                content=None,
                tool_calls=[ToolCall(id="c1", name="no_such_tool", arguments={})],
            ),
            ChatTurn(content="I could not use that tool."),
        ]
    )
    resp = _svc(tools, sessions, llm).respond(None, "hi")
    tool_msgs = [m for m in sessions.get(resp.session_id).messages if m.role == "tool"]
    assert "unknown tool" in tool_msgs[0].content
    assert resp.message.content == "I could not use that tool."


def test_max_steps_exhausted(service) -> None:
    ctx, sessions, tools = service
    llm = ScriptedLLM(
        [ChatTurn(content=None, tool_calls=[ToolCall(id="c1", name="list_agents", arguments={})])]
        * 5
    )
    resp = _svc(tools, sessions, llm, max_steps=1).respond(None, "loop")
    assert "ran out of steps" in resp.message.content
