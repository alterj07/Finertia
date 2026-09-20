"""Agent registry: the menu the orchestrator plans from. New specialist agents
register here; the orchestrator never hardcodes them."""

from app.agents.base import Agent, AgentSpec


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[str, type[Agent]] = {}

    def register(self, agent_cls: type[Agent]) -> type[Agent]:
        self._agents[agent_cls.name] = agent_cls
        return agent_cls

    def get(self, name: str) -> Agent:
        return self._agents[name]()

    def specs(self) -> list[AgentSpec]:
        return [cls.spec() for cls in self._agents.values()]

    def names(self) -> list[str]:
        return list(self._agents)


def default_registry() -> AgentRegistry:
    from app.agents.apar.agent import APARAgent
    from app.agents.recon.agent import CashReconAgent

    registry = AgentRegistry()
    registry.register(CashReconAgent)
    registry.register(APARAgent)
    return registry
