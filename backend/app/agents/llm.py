"""LLM seam. Agents are rule-based and deterministic today; an LLM provider
plugs in here for the orchestrator's planning and, later, explaining findings
in natural language or drafting adjustments from chatbot feedback.
"""

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from app.config import Settings


class LLMProvider(Protocol):
    available: bool

    def complete(
        self, prompt: str, *, system: str | None = None, json_mode: bool = False, **kw: Any
    ) -> str: ...


class NullLLM:
    """Placeholder provider: no API keys, no network. `available` is False so
    callers (e.g. the orchestrator) can fall back deterministically."""

    available = False

    def complete(
        self, prompt: str, *, system: str | None = None, json_mode: bool = False, **kw: Any
    ) -> str:
        raise NotImplementedError(
            "No LLM provider configured. Set OPENAI_API_KEY or wire a real "
            "LLMProvider into AgentContext to enable LLM-assisted features."
        )


class OpenAIProvider:
    available = True

    def __init__(self, api_key: str, model: str) -> None:
        from openai import NOT_GIVEN, OpenAI

        self._not_given = NOT_GIVEN
        self.model = model
        self._client = OpenAI(api_key=api_key)

    def complete(
        self, prompt: str, *, system: str | None = None, json_mode: bool = False, **kw: Any
    ) -> str:
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"} if json_mode else self._not_given,
        )
        return resp.choices[0].message.content or ""


def build_llm(settings: "Settings") -> LLMProvider:
    key = settings.openai_api_key
    if key is not None and key.get_secret_value():
        return OpenAIProvider(api_key=key.get_secret_value(), model=settings.openai_model)
    return NullLLM()
