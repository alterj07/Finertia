from pathlib import Path
from typing import Annotated

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
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


settings = Settings()
