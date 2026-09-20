from pathlib import Path
from typing import Annotated, Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Finertia API"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    data_dir: Path = Path("../data")
    memory_graph_path: Path = Path("./var/memory_graph.json")
    feedback_path: Path = Path("./var/feedback.json")
    chat_sessions_path: Path = Path("./var/chat_sessions.json")
    users_path: Path = Path("./var/users.json")
    auth_required: bool = True
    auth_secret: SecretStr = SecretStr("dev-secret-change-me")
    auth_token_ttl_hours: int = 168
    demo_admin_username: str = "admin"
    demo_admin_password: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"
    storage_backend: Literal["local", "elastic"] = "elastic"
    es_url: str = "http://localhost:9200"
    es_api_key: SecretStr | None = None
    es_index_prefix: str = ""
    auto_run_agents: bool = True
    auto_run_request: str = (
        "Close the books for Q1: reconcile cash, review payables and receivables, "
        "and review the deal pipeline"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
