"""LLM seam. Agents are rule-based and deterministic today; an LLM provider
could plug in here to e.g. explain findings in natural language, draft
adjustments from chatbot feedback, or propose JEs from messy evidence.
"""

from typing import Any, Protocol


class LLMProvider(Protocol):
    def complete(self, prompt: str, **kw: Any) -> str: ...


class NullLLM:
    """Placeholder provider: no API keys, no network. Raises if actually used."""

    def complete(self, prompt: str, **kw: Any) -> str:
        raise NotImplementedError(
            "No LLM provider configured. Wire a real LLMProvider "
            "(e.g. an OpenAI/Anthropic client) into AgentContext to enable "
            "LLM-assisted features."
        )
