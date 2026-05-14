from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from dataclasses import dataclass, field

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


@dataclass(slots=True)
class Settings:
    app_name: str = "AgentCAD Backend"
    api_prefix: str = "/api"
    # OpenAI configuration
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1"
    # Google Gemini configuration
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_project_id: str | None = None
    gemini_location: str | None = None
    gemini_credentials_file: str | None = None
    # LLM provider selection
    llm_provider: str = "openai"  # "openai" or "gemini"
    # Metadata storage
    metadata_backend: str = "local"  # "local", "postgres", or "supabase"
    sqlite_url: str = f"sqlite:///{(BASE_DIR / 'storage' / 'app.db').as_posix()}"
    postgres_url: str | None = None
    supabase_db_url: str | None = None
    database_url: str = f"sqlite:///{(BASE_DIR / 'storage' / 'app.db').as_posix()}"
    # File/object storage
    video_storage_backend: str = "local"  # "local" or "minio"
    video_public_base_url: str | None = None
    minio_endpoint: str | None = None
    minio_access_key: str | None = None
    minio_secret_key: str | None = None
    minio_bucket: str = "agentcad-videos"
    minio_secure: bool = False
    # Other settings
    export_dir: Path = BASE_DIR / "storage" / "steps"
    upload_dir: Path = BASE_DIR / "storage" / "uploads"
    video_dir: Path = BASE_DIR / "storage" / "videos"
    agent_temperature: float = 0.1
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    sqlite_url = os.getenv("SQLITE_URL", f"sqlite:///{(BASE_DIR / 'storage' / 'app.db').as_posix()}")
    postgres_url = os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL")
    supabase_db_url = os.getenv("SUPABASE_DB_URL")
    metadata_backend = os.getenv("METADATA_BACKEND", "local").lower()
    settings = Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4.1"),
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        gemini_project_id=os.getenv("GEMINI_PROJECT_ID"),
        gemini_location=os.getenv("GEMINI_LOCATION", "us-west1"),
        gemini_credentials_file=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        llm_provider=os.getenv("LLM_PROVIDER", "openai"),
        metadata_backend=metadata_backend,
        sqlite_url=sqlite_url,
        postgres_url=postgres_url,
        supabase_db_url=supabase_db_url,
        database_url=_database_url_for_backend(
            metadata_backend=metadata_backend,
            sqlite_url=sqlite_url,
            postgres_url=postgres_url,
            supabase_db_url=supabase_db_url,
        ),
        video_storage_backend=os.getenv("VIDEO_STORAGE_BACKEND", "local").lower(),
        video_public_base_url=os.getenv("VIDEO_PUBLIC_BASE_URL"),
        minio_endpoint=os.getenv("MINIO_ENDPOINT"),
        minio_access_key=os.getenv("MINIO_ACCESS_KEY"),
        minio_secret_key=os.getenv("MINIO_SECRET_KEY"),
        minio_bucket=os.getenv("MINIO_BUCKET", "agentcad-videos"),
        minio_secure=_env_bool("MINIO_SECURE", default=False),
        agent_temperature=float(os.getenv("AGENT_TEMPERATURE", "0.1")),
    )
    settings.export_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.video_dir.mkdir(parents=True, exist_ok=True)
    return settings


def _database_url_for_backend(
    *,
    metadata_backend: str,
    sqlite_url: str,
    postgres_url: str | None,
    supabase_db_url: str | None,
) -> str:
    if metadata_backend == "local":
        return sqlite_url
    if metadata_backend == "postgres":
        if not postgres_url:
            raise RuntimeError("POSTGRES_URL or DATABASE_URL is required when METADATA_BACKEND=postgres")
        return postgres_url
    if metadata_backend == "supabase":
        if not supabase_db_url:
            raise RuntimeError("SUPABASE_DB_URL is required when METADATA_BACKEND=supabase")
        return supabase_db_url
    raise RuntimeError("METADATA_BACKEND must be one of: local, postgres, supabase")


def _env_bool(name: str, *, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
