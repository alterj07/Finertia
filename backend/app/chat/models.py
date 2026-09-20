import json
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.agents.llm import ToolCall


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = None
    tool_calls: list[ToolCall] = []
    tool_call_id: str | None = None
    name: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now().replace(microsecond=0))

    def to_openai(self) -> dict[str, Any]:
        if self.role == "assistant" and self.tool_calls:
            return {
                "role": "assistant",
                "content": self.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                    }
                    for tc in self.tool_calls
                ],
            }
        if self.role == "tool":
            return {
                "role": "tool",
                "tool_call_id": self.tool_call_id,
                "content": self.content,
            }
        return {"role": self.role, "content": self.content}


class ToolEvent(BaseModel):
    name: str
    arguments: dict[str, Any] = {}
    result_preview: str = ""
    citations: list[str] = []


class ChatSession(BaseModel):
    id: str
    title: str = ""
    user_id: str = ""
    messages: list[ChatMessage] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now().replace(microsecond=0))
    updated_at: datetime = Field(default_factory=lambda: datetime.now().replace(microsecond=0))


class ChatResponse(BaseModel):
    session_id: str
    message: ChatMessage
    tool_events: list[ToolEvent] = []
    citations: list[str] = []
