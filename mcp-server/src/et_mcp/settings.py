"""Standalone settings — zero hardcoding, env-only. No reference to any previous project."""
from __future__ import annotations

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Retrieval ──
    embedding_model_name: str = Field(default="BAAI/bge-small-en-v1.5", alias="EMBEDDING_MODEL_NAME")
    embedding_dim: int = Field(default=384, alias="EMBEDDING_DIM")
    reranker_model_name: str = Field(default="BAAI/bge-base-en-v1.5", alias="RERANKER_MODEL_NAME")
    qdrant_url: str = Field(default="", alias="QDRANT_URL")  # empty => .qdrant_storage
    qdrant_api_key: SecretStr | None = Field(default=None, alias="QDRANT_API_KEY")

    # ── Catalog DB (read-only Supabase Postgres) ──
    # Values from .env populate this object only (they are not exported to
    # os.environ), so every module must read configuration from `settings`.
    supabase_db_url: SecretStr | None = Field(default=None, alias="SUPABASE_DB_URL")
    supabase_pooler_db_url: SecretStr | None = Field(default=None, alias="SUPABASE_POOLER_DB_URL")
    database_url: SecretStr | None = Field(default=None, alias="DATABASE_URL")
    db_host: str | None = Field(default=None, alias="DB_HOST")
    db_port: int = Field(default=5432, alias="DB_PORT")
    db_name: str = Field(default="postgres", alias="DB_NAME")
    db_user: str | None = Field(default=None, alias="DB_USER")
    db_password: SecretStr | None = Field(default=None, alias="DB_PASSWORD")
    catalog_schema: str = Field(default="ragav", alias="CATALOG_SCHEMA", pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")
    db_statement_timeout_ms: int = Field(default=8000, alias="DB_STATEMENT_TIMEOUT_MS")
    db_row_limit: int = Field(default=500, alias="DB_ROW_LIMIT")
    # Drop list_price/price_usd from every catalog result and reject queries on
    # them. Enable for customer-facing assistants that must never quote prices.
    catalog_hide_prices: bool = Field(default=False, alias="CATALOG_HIDE_PRICES")
    cache_ttl_s: int = Field(default=300, alias="ETK_CACHE_TTL_S")

    # ── Retrieval tuning ──
    site_min_confidence: float = Field(default=0.35, alias="SITE_MIN_CONFIDENCE")
    disable_site_vector: bool = Field(default=True, alias="DISABLE_SITE_VECTOR")
    enable_reranking_calc: bool = Field(default=False, alias="ENABLE_RERANKING_CALC")
    enable_reranking_site: bool = Field(default=False, alias="ENABLE_RERANKING_SITE")
    enable_reranking_catalog: bool = Field(default=False, alias="ENABLE_RERANKING_CATALOG")

    # ── HTTP transport ──
    mcp_allowed_hosts: str = Field(default="", alias="MCP_ALLOWED_HOSTS")  # comma-separated Host headers

    @property
    def resolved_qdrant_url(self) -> str:
        if self.qdrant_url:
            return self.qdrant_url
        # standalone default: <project_root>/.qdrant_storage (created on first run)
        return str(Path(__file__).resolve().parents[2] / ".qdrant_storage")


settings = Settings()
