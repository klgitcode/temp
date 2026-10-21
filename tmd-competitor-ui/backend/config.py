from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, unquote

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "TMD Competitor API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_pool_pre_ping: bool = False
    database_url: str
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    supabase_service_role_key: str | None = None
    gcp_project_id: str | None = None
    gcp_project_number: str | None = None
    gcp_location: str = "global"
    vertex_ai_model: str = "gemini-2.5-flash"
    ai_summary_type: str = "daily_market_summary"
    ai_summary_prompt_version: str = "v2"

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+psycopg://", 1)
        return cls._quote_password_if_needed(value)

    @classmethod
    def _quote_password_if_needed(cls, value: str) -> str:
        if "://" not in value:
            return value

        scheme, rest = value.split("://", 1)
        if "@" not in rest:
            return value

        credentials, host = rest.rsplit("@", 1)
        if ":" not in credentials:
            return value

        username, password = credentials.split(":", 1)
        encoded_password = quote(unquote(password), safe="")
        return f"{scheme}://{username}:{encoded_password}@{host}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
