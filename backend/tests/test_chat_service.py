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
from app.memory.models import Finding


class ScriptedLLM:
    available = True

    def __init__(self, turns: list[ChatTurn]) -> None:
        self.turns = list(turns)
        self.received: list[list[dict]] = []

    def complete(self, prompt: str, **kw: Any) -> str:
        return ""

    def chat(
        self, messages: list[dict], tools: list[dict] | None = None, **kw: Any
    ) -> ChatTurn:
        self.received.append(list(messages))
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


def test_context_is_transient(service) -> None:
    ctx, sessions, tools = service
    llm = ScriptedLLM([ChatTurn(content="ok")])
    resp = _svc(tools, sessions, llm).respond(
        None, "what is open?", context="Module: reconciliation"
    )
    sent = llm.received[0]
    assert sent[-2] == {"role": "system", "content": "Screen context: Module: reconciliation"}
    assert sent[-1]["content"] == "what is open?"
    # not persisted
    persisted = sessions.get(resp.session_id).messages
    assert all(m.content != "Screen context: Module: reconciliation" for m in persisted)
    assert [m.role for m in persisted] == ["user", "assistant"]


def test_findings_digest_is_transient(service) -> None:
    ctx, sessions, tools = service
    ctx.memory.remember(
        Finding(
            agent="Cash & Reconciliation",
            code="LUMP_SUM_MATCH",
            key="BK00044",
            title="Bank credit BK00044 covers 3 invoices",
            detail="Many-to-one match",
            amount=58339.68,
            entities=["BK00044", "AR-1033"],
        )
    )
    llm = ScriptedLLM([ChatTurn(content="ok")])
    resp = _svc(tools, sessions, llm, memory=ctx.memory).respond(None, "hi")
    digest = llm.received[0][1]
    assert digest["role"] == "system"
    assert digest["content"].startswith("Current agent findings")
    assert "[finding:LUMP_SUM_MATCH:BK00044]" in digest["content"]
    assert "$58,339.68" in digest["content"]
    assert "BK00044, AR-1033" in digest["content"]
    persisted = sessions.get(resp.session_id).messages
    assert all("Current agent findings" not in (m.content or "") for m in persisted)


def test_citations_include_digest_ids(service) -> None:
    ctx, sessions, tools = service
    ctx.memory.remember(
        Finding(
            agent="Cash & Reconciliation",
            code="FX_DIFFERENCE",
            key="BP-4471",
            title="FX difference on BP-4471",
            detail="Settled vs booked",
            amount=72.0,
            entities=["BP-4471"],
        )
    )
    llm = ScriptedLLM(
        [ChatTurn(content="See [finding:FX_DIFFERENCE:BP-4471] and [NOPE-1].")]
    )
    resp = _svc(tools, sessions, llm, memory=ctx.memory).respond(None, "hi")
    assert resp.citations == ["finding:FX_DIFFERENCE:BP-4471"]


def test_response_carries_labels(service) -> None:
    ctx, sessions, tools = service
    llm = ScriptedLLM([ChatTurn(content="Harbor Insurance Co [V012] is a vendor.")])
    resp = _svc(tools, sessions, llm, memory=ctx.memory).respond(None, "hi")
    assert resp.citations == ["V012"]
    assert resp.labels == {"V012": "Harbor Insurance Co"}


def test_findings_digest_empty(service) -> None:
    ctx, sessions, tools = service
    llm = ScriptedLLM([ChatTurn(content="ok")])
    _svc(tools, sessions, llm, memory=ctx.memory).respond(None, "hi")
    assert "No agent findings yet" in llm.received[0][1]["content"]


def test_max_steps_exhausted(service) -> None:
    ctx, sessions, tools = service
    llm = ScriptedLLM(
        [ChatTurn(content=None, tool_calls=[ToolCall(id="c1", name="list_agents", arguments={})])]
        * 5
    )
    resp = _svc(tools, sessions, llm, max_steps=1).respond(None, "loop")
    assert "ran out of steps" in resp.message.content


def test_system_prompt_readability_rules() -> None:
    from app.chat.service import SYSTEM_PROMPT

    assert "Hard limit 120 words" in SYSTEM_PROMPT


def test_chat_passes_max_tokens(service) -> None:
    ctx, sessions, tools = service

    class KwargsLLM(ScriptedLLM):
        def __init__(self, turns):
            super().__init__(turns)
            self.kwargs: list[dict] = []

        def chat(self, messages, tools=None, **kw):
            self.kwargs.append(dict(kw))
            return super().chat(messages, tools, **kw)

    llm = KwargsLLM([ChatTurn(content="done")])
    _svc(tools, sessions, llm).respond(None, "hi")
    assert llm.kwargs and llm.kwargs[0].get("max_tokens") == 450
