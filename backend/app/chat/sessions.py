"""ChatSessionStore: JSON-file list of chat sessions (same style as FeedbackStore)."""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.chat.models import ChatMessage, ChatSession


class ChatSessionStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self.sessions: list[ChatSession] = []
        if path and path.exists():
            self.sessions = [ChatSession(**s) for s in json.loads(path.read_text())]

    def _save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([s.model_dump(mode="json") for s in self.sessions], indent=2)
        )

    def create(self, title: str = "", user_id: str = "") -> ChatSession:
        session = ChatSession(id=uuid.uuid4().hex[:12], title=title, user_id=user_id)
        self.sessions.append(session)
        self._save()
        return session

    def get(self, id: str) -> ChatSession | None:
        return next((s for s in self.sessions if s.id == id), None)

    def list(self) -> list[dict[str, Any]]:
        return [
            {
                "id": s.id,
                "title": s.title,
                "updated_at": s.updated_at.isoformat(),
                "message_count": len(s.messages),
                "user_id": s.user_id,
            }
            for s in sorted(self.sessions, key=lambda s: s.updated_at, reverse=True)
        ]

    def append(self, id: str, *messages: ChatMessage) -> ChatSession:
        session = self.get(id)
        if session is None:
            raise KeyError(f"unknown session {id}")
        session.messages.extend(messages)
        if not session.title:
            first_user = next((m for m in session.messages if m.role == "user"), None)
            if first_user and first_user.content:
                session.title = first_user.content[:60]
        session.updated_at = datetime.now().replace(microsecond=0)
        self._save()
        return session

    def delete(self, id: str) -> bool:
        before = len(self.sessions)
        self.sessions = [s for s in self.sessions if s.id != id]
        changed = len(self.sessions) != before
        if changed:
            self._save()
        return changed
