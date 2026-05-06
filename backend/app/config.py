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
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1"
    sqlite_url: str = f"sqlite:///{(BASE_DIR / 'storage' / 'app.db').as_posix()}"
    export_dir: Path = BASE_DIR / "storage" / "steps"
    upload_dir: Path = BASE_DIR / "storage" / "uploads"
    agent_temperature: float = 0.1
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
        agent_temperature=float(os.getenv("AGENT_TEMPERATURE", "0.1")),
    )
    settings.export_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings
